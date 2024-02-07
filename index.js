const express = require("express");
const cors = require("express");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5379;
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

app.use(express.json());
app.use(cors());

app.get("/", ({ res }) => {
    res.status(200).send({ message: "Server Started" });
});

const runMongoConnection = async () => {
    try {
        await client.connect();
        console.log("MongoDB Connected");
        const productCollection = client.db("outfitex").collection("products");

        app.get("/products", async ({ res }) => {
            try {
                const cursor = productCollection.find({});
                const products = await cursor.toArray();
                res.status(200).send(products);
            } catch (error) {
                res.status(500).send(error);
            }
        });
    } finally {
    }
};

runMongoConnection().catch(async (error) => {
    await client.close();
    console.error(error);
});

app.listen(port, () => console.log("Welcome...!"));
