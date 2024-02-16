const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const fileUpload = require("express-fileupload");
const sharp = require("sharp");
const bcrybt = require("bcrypt");
const { slugify } = require("./utils/slugify.utils");

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
        const userCollection = client.db("outfitex").collection("users");
        const sellerCollection = client.db("outfitex").collection("seller");
        const adminCollection = client.db("outfitex").collection("admin");

        /****************** PRODUCTS ********************/
        //get products
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

        //create new products
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
                    slug: slugify(name),
                    name,
                    price: parseFloat(price),
                    category,
                    collection,
                    description,
                    image,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    sellingCount: 0,
                    isFeatured: false,
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

        /*********************** AUTHENTICATION **************************/
        //login
        app.post("/login", async (req, res) => {
            try {
                const { email, password: userPassword } = req.body;
                let role = "";
                let info = {};

                if (!email || !userPassword) {
                    res.status(400).send({
                        message: "provide all the information for login",
                    });
                }

                info = await userCollection.findOne({ email: email });
                role = "user";
                if (!info) {
                    info = await sellerCollection.findOne({ email: email });
                    role = "seller";
                }
                if (!info) {
                    info = await adminCollection.findOne({ email: email });
                    role = "admin";
                }
                if (!info) {
                    role = "";
                    res.status(404).send({ message: "Email not found" });
                }

                const { password, ...restInfo } = info;
                const result = await bcrybt.compare(userPassword, password);

                if (!result) {
                    res.status(400).send({ message: "Password not matched" });
                }

                res.status(200).send({
                    info: { ...restInfo, role },
                    message: "Successfully login to your account",
                });
            } catch (err) {
                console.log(err);
                res.status(500).send({ message: "internal server error" });
            }
        });

        //user registration
        app.post("/user", async (req, res) => {
            try {
                const { name, userName, email, phone, address, password } =
                    req.body;

                if (
                    !name ||
                    !userName ||
                    !email ||
                    !phone ||
                    !address ||
                    !password
                ) {
                    res.status(400).send({
                        message:
                            "provide all the information for creating new account",
                    });
                }

                const salt = await bcrybt.genSalt(
                    parseInt(process.env.BCRYPT_SALT)
                );
                const hashedPassword = await bcrybt.hash(password, salt);

                const newUser = {
                    name,
                    userName,
                    email,
                    phone,
                    address,
                    password: hashedPassword,
                    photo: { data: "", type: "" },
                };

                const response = await userCollection.insertOne(newUser);

                if (response.acknowledged) {
                    res.status(201).send({
                        message: "User Created Successfully",
                    });
                } else {
                    res.status(500).send({
                        message: "Failed to create new user",
                    });
                }
            } catch (error) {
                res.status(500).send({ message: "Failed to create new user" });
            }
        });

        //seller registration
        app.post("/seller", async (req, res) => {
            try {
                const {
                    name,
                    userName,
                    email,
                    phone,
                    personalAddress,
                    corporateAddress,
                    nidNumber,
                    password,
                } = req.body;

                if (
                    !name ||
                    !userName ||
                    !email ||
                    !phone ||
                    !personalAddress ||
                    !corporateAddress ||
                    !nidNumber ||
                    !password
                ) {
                    res.status(400).send({
                        message:
                            "provide all the information for creating new account",
                    });
                }

                const salt = await bcrybt.genSalt(
                    parseInt(process.env.BCRYPT_SALT)
                );
                const hashedPassword = await bcrybt.hash(password, salt);

                const newSeller = {
                    name,
                    userName,
                    email,
                    phone,
                    personalAddress,
                    corporateAddress,
                    nidNumber,
                    password: hashedPassword,
                    photo: { data: "", type: "" },
                    slug: slugify(name),
                };

                console.log(newSeller);

                const response = await sellerCollection.insertOne(newSeller);

                if (response.acknowledged) {
                    res.status(201).send({
                        message: "Seller Registration Successfull",
                    });
                } else {
                    res.status(500).send({
                        message: "Failed to create new seller",
                    });
                }
            } catch (error) {
                res.status(500).send({
                    message: "Failed to create new seller",
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
