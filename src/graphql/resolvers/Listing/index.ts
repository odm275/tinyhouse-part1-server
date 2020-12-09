import { IResolvers } from "apollo-server-express";
import { Request } from "express";
import { ObjectId } from "mongodb";
import { Cloudinary, Google } from "../../../lib/api";
import { Database, Listing, ListingType, User } from "../../../lib/types";
import { authorize } from "../../../lib/utils";
import {
  ListingArgs,
  ListingBookingsArgs,
  ListingBookingsData,
  ListingsArgs,
  ListingsData,
  ListingsFilter,
  ListingsQuery,
  HostListingInput,
  HostListingArgs,
  AutoCompleteArgs,
  AutoCompleteResult,
  CityAndAdmin,
  CityAndAdminResults
} from "./types";

const verifyHostListingInput = ({
  title,
  description,
  type,
  price,
}: HostListingInput) => {
  if (title.length > 100) {
    throw new Error("listing title must be under 100 characters");
  }
  if (description.length > 5000) {
    throw new Error("listing description must be under 5000 characters");
  }
  if (type !== ListingType.Apartment && type !== ListingType.House) {
    throw new Error("listing type must be either appartment or house");
  }
  if (price < 0) {
    throw new Error("price must be greater than 0");
  }
};

export const listingResolvers: IResolvers = {
  AutoCompleteResult: {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    __resolveType: (obj:any) => {
      if(obj.hasOwnProperty('region')) {
        return "Listings";
      }
      if(obj.hasOwnProperty('dummy')){
        return "CityAndAdminResults";
      }      
      return null;
    }
  },
  Query: {
    autoCompleteOptions: async (
      _root: undefined,
      { text }: AutoCompleteArgs,
      { db }: { db: Database }
    ): Promise<AutoCompleteResult> => {
      try {

        // The normal case
        const addressData: ListingsData = {
          total: 0,
          result: [],
          region: null,
        };

        // WHen we're trying to magically return cities without repeating ourselves.
        const cityAdminData:CityAndAdminResults = {
          total: 0,
          result: [],
          dummy:0
        };

        // First we're going try to match with states

        const groupCity = await db.listings.aggregate([
          {
            $search: {
              autocomplete: {
                query: `${text}`,
                path: "city",
              },
            },
          },
          {
            $group: {
              _id: { admin: "$admin", city: "$city" },
            },
          },
        ]);

        const groupCityResults = await groupCity.toArray();
        const groupCityResultsLenght = groupCityResults.length
        const cityMatchText = groupCityResultsLenght > 0;
        
        // If we succesfully query for cities ...
        if(cityMatchText){
          const groupCityFormatResults: CityAndAdmin[] = groupCityResults.map((result:any) => {
            return { admin:result._id.admin, city: result._id.city }
          });
          cityAdminData.result = groupCityFormatResults;
          cityAdminData.total = groupCityResultsLenght;

          return cityAdminData;
        }
        // SEARCH FOR ADDRESS VIA TEXT
        const addressResult = await db.listings.aggregate([
          {
            $search: {
              autocomplete: {
                query: `${text}`,
                path: "address",
              },
            },
          },
        ]);
        const limitAddressResult = addressResult.limit(5);
        const listings = await limitAddressResult.toArray();
        addressData.result = listings;
        addressData.total = listings.length;

        return addressData;
      } catch (error) {
        throw new Error(`Failed to search(autocomplete) listings : ${error}`);
      }
    },
    listing: async (
      _root: undefined,
      { id }: ListingArgs,
      { db, req }: { db: Database; req: Request }
    ): Promise<Listing> => {
      console.log("id", id);
      try {
        const listing = await db.listings.findOne({ _id: new ObjectId(id) });
        if (!listing) {
          throw new Error("listings can't be found");
        }

        const viewer = await authorize(db, req);
        if (viewer && viewer._id === listing.host) {
          listing.authorized = true;
        }
        return listing;
      } catch (error) {
        throw new Error(`Failed to query listings : ${error}`);
      }
    },
    listings: async (
      _root: undefined,
      { location, filter, limit, page }: ListingsArgs,
      { db }: { db: Database }
    ): Promise<ListingsData> => {
      try {
        const query: ListingsQuery = {};
        const data: ListingsData = {
          total: 0,
          result: [],
          region: null,
        };

        if (location) {
          const { country, admin, city } = await Google.geocode(location);

          if (city) query.city = city;
          if (admin) query.admin = admin;
          if (country) {
            query.country = country;
          } else {
            throw new Error("no country found");
          }
          const cityText = city ? `${city}, ` : "";
          const adminText = admin ? `${admin}, ` : "";
          data.region = `${cityText}${adminText}${country}`;
        }

        let cursor = await db.listings.find(query);

        if (filter && filter === ListingsFilter.PRICE_LOW_TO_HIGH) {
          cursor = cursor.sort({ price: 1 });
        }

        if (filter && filter === ListingsFilter.PRICE_HIGH_TO_LOW) {
          cursor = cursor.sort({ price: -1 });
        }

        cursor = cursor.skip(page > 0 ? (page - 1) * limit : 0);
        cursor = cursor.limit(limit);

        data.total = await cursor.count();
        data.result = await cursor.toArray();

        return data;
      } catch (error) {
        throw new Error(`Failed to query listings: ${error}`);
      }
    },
  },
  Mutation: {
    hostListing: async (
      _root: undefined,
      { input }: HostListingArgs,
      { db, req }: { db: Database; req: Request }
    ): Promise<Listing> => {
      verifyHostListingInput(input);

      // eslint-disable-next-line prefer-const
      let viewer = await authorize(db, req);
      if (!viewer) {
        throw new Error("viewer cannot be found");
      }
      const { country, admin, city } = await Google.geocode(input.address);
      if (!country || !admin || !city) {
        throw new Error("invalid address input");
      }

      const imageUrl = await Cloudinary.upload(input.image);
      console.log("imageUrl", imageUrl);

      const insertResult = await db.listings.insertOne({
        _id: new ObjectId(),
        ...input,
        image: imageUrl,
        bookings: [],
        bookingsIndex: {},
        country,
        admin,
        city,
        host: viewer._id, //reference the user id(viewer)
      });

      const insertedListing: Listing = insertResult.ops[0];

      await db.users.updateOne(
        { _id: viewer._id },
        { $push: { listings: insertedListing._id } }
      );
      return insertedListing;
    },
  },
  Listing: {
    id: (listing: Listing): string => {
      return listing._id.toString();
    },
    host: async (
      listing: Listing,
      _args: {},
      { db }: { db: Database }
    ): Promise<User> => {
      const host = await db.users.findOne({ _id: listing.host });
      if (!host) {
        throw new Error("host can't be found");
      }
      return host;
    },
    bookingsIndex: (listing: Listing): string => {
      return JSON.stringify(listing.bookingsIndex);
    },
    bookings: async (
      listing: Listing,
      { limit, page }: ListingBookingsArgs,
      { db }: { db: Database }
    ): Promise<ListingBookingsData | null> => {
      try {
        if (!listing.authorized) {
          return null;
        }

        const data: ListingBookingsData = {
          total: 0,
          result: [],
        };
        // Find all ids in listing.bookings(listing being passed in as args) -> returns array of bookings
        let cursor = await db.bookings.find({
          _id: { $in: listing.bookings },
        });

        cursor = cursor.skip(page > 0 ? (page - 1) * limit : 0);
        cursor = cursor.limit(limit);

        data.total = await cursor.count();
        data.result = await cursor.toArray();

        return data;
      } catch (error) {
        throw new Error(`Failed to query listing bookings: ${error}`);
      }
    },
  },
};
