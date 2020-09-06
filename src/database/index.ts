import { MongoClient } from 'mongodb'
import { Database } from '../lib/types'
console.log(process.env.DB_USER)
console.log(process.env.DB_USER_PASSWORD)
console.log(process.env.DB_CLUSTER)

const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER_PASSWORD}@${process.env.DB_CLUSTER}.mongodb.net/<dbname>?retryWrites=true&w=majority`

export const connectDatabase = async (): Promise<Database> => {
  const client = await MongoClient.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  const db = client.db('main')

  return {
    listings: db.collection('test_listings'),
  }
}
