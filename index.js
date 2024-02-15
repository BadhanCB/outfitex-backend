const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const fileUpload = require("express-fileupload");
const sharp = require("sharp");

const app = express();
const port = process.env.PORT || 5379;
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

//middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(fileUpload());

//api routes
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
                const total = await productCollection.estimatedDocumentCount();

                const products = await cursor.toArray();
                res.status(200).send({ products, total });
            } catch (error) {
                res.status(500).send(error);
            }
        });

        app.post("/products", async (req, res) => {
            try {
                const { data } = req?.files?.file;
                const { name, price, category, collection, description } =
                    req.body;

                let img;
                await sharp(data)
                    .resize(320)
                    .toFormat("webp")
                    .toBuffer()
                    .then((data) => (img = data))
                    .catch((err) => res.status(500).send(err));

                const encImg = img.toString("base64");

                const image = {
                    data: Buffer.from(encImg, "base64"),
                    type: "image/webp",
                };

                const newProduct = {
                    name,
                    price: parseFloat(price),
                    category,
                    collection,
                    description,
                    image,
                    createdAt: new Date(),
                    sellingCount: 0,
                };

                const response = await productCollection.insertOne(newProduct);
                if (response.acknowledged) {
                    res.status(201).send({
                        message: "Product created Successfully",
                    });
                } else {
                    res.status(500).send({
                        message: "Failed to create new product",
                    });
                }
            } catch (error) {
                console.error(error);
                res.status(500).send({
                    message: "Failed to create new product",
                });
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
