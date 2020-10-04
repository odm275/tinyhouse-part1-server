import { Collection, ObjectId } from "mongodb";

export interface Viewer {
  _id?: string;
  token?: string;
  avatar?: string;
  walletId?: string; // Actual wallet id
  didRequest: boolean;
}

export enum ListingType {
  Apartment = "APARTMENT",
  House = "HOUSE",
}

export interface BookingsIndexMonth {
  [key: string]: boolean;
}

export interface BookingsIndexYear {
  [key: string]: BookingsIndexMonth;
}

export interface BookingsIndex {
  [key: string]: BookingsIndexYear;
}

export interface Booking {
  _id: ObjectId;
  listing: ObjectId; // One to One relationship
  tenant: string; // One to One relationship to user
  checkIn: string;
  checkOut: string;
}

export interface Listing {
  _id: ObjectId;
  title: string;
  description: string;
  image: string;
  host: string; // Reference to the host(User's _id field). This is a one to one relationship -> One Listing holds ONE relationship to one host
  type: ListingType;
  address: string;
  country: string;
  admin: string;
  city: string;
  bookings: ObjectId[];
  bookingsIndex: BookingsIndex;
  price: number;
  numOfGuests: number;
  authorized?: boolean;
}
export interface User {
  _id: string; // we are going use a 3rd party service to generate ids, we won't use ObjectId because these ids don't conform to the format mongodb expects.
  token: string; // Store User login seession token.
  name: string;
  avatar: string;
  contact: string;
  walletId?: string;
  income: number;
  bookings: ObjectId[]; // One to Many: One User holds many references to bookings.
  listings: ObjectId[]; // One to Many: One User holds many references to listings.
  authorized?: boolean;
}

export interface Database {
  listings: Collection<Listing>;
  users: Collection<User>;
  bookings: Collection<Booking>;
}
