import { gql } from "apollo-server-express";

export const typeDefs = gql`
  type Viewer {
    id: ID
    token: String
    avatar: String
    hasWallet: Boolean # Resolve this as a boolean since we don't want the actual walletId to make it to the client
    didRequest: Boolean!
  }
  type Query {
    authUrl: String!
  }

  input LogInInput {
    code: String!
  }

  type Mutation {
    logIn(input: LogInInput): Viewer!
    logOut: Viewer!
  }
`;
