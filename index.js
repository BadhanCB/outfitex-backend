const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const fileUpload = require("express-fileupload");
const sharp = require("sharp");
const bcrybt = require("bcrypt");
const jwt = require("jsonwebtoken");
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
        const orderCollection = client.db("outfitex").collection("orders");
        const sellerCollection = client.db("outfitex").collection("seller");
        const adminCollection = client.db("outfitex").collection("admin");
        const collectionsCollection = client
            .db("outfitex")
            .collection("collections");

        /****************** VERIFY JWT(JWT Authorization) ********************/
        //vreify token(for all type of user)
        async function verifyToken(req, res, next) {
            try {
                const token = req.headers.authorization.split(" ")[1];
                const data = jwt.decode(token, process.env.JWT_SECRET);
                const { _id, name, userName, email, phone, role } = data;
                let info;

                if ((role !== "user") | "seller") {
                    res.status(401).send({ message: "Unauthorized Access" });
                    return;
                }

                info = await userCollection.findOne({ _id: new ObjectId(_id) });
                if (!info) {
                    info = await sellerCollection.findOne({
                        _id: new ObjectId(_id),
                    });
                }
                if (!info) {
                    info = await adminCollection.findOne({
                        _id: new ObjectId(_id),
                    });
                }
                if (!info) {
                    res.status(401).send({ message: "Unauthorized Access" });
                    return;
                }

                if (
                    name !== info.name ||
                    userName !== info.userName ||
                    email !== info.email ||
                    phone !== info.phone
                ) {
                    res.status(401).send({ message: "Unauthorized Access" });
                    return;
                }
                req.userInfo = { role, _id };
                next();
            } catch (error) {
                res.status(500).send({ message: "Internal Server Error" });
            }
        }

        //verify seller token
        async function verifySellerToken(req, res, next) {
            const token = req.headers.authorization.split(" ")[1];
            const data = jwt.decode(token, process.env.JWT_SECRET);
            const { _id, name, userName, email, phone, slug, role } = data;

            if (role !== "seller") {
                res.status(401).send({ message: "Unauthorized Access" });
                return;
            }

            const sellerData = await sellerCollection.findOne({
                _id: new ObjectId(_id),
            });

            if (!sellerData) {
                res.status(401).send({ message: "Unauthorized Access" });
                return;
            }

            if (
                name !== sellerData.name ||
                userName !== sellerData.userName ||
                email !== sellerData.email ||
                phone !== sellerData.phone
            ) {
                console.log("Seller data not matched");
                res.status(401).send({ message: "Unauthorized Access" });
                return;
            }
            req.body = {
                ...req.body,
                seller: { _id, name, userName, email, phone, slug },
            };
            next();
        }

        //vreify user token
        async function verifyUserToken(req, res, next) {
            try {
                const token = req.headers.authorization.split(" ")[1];
                const data = jwt.decode(token, process.env.JWT_SECRET);
                const { _id, name, userName, email, phone, role } = data;

                if (role !== "user") {
                    res.status(401).send({ message: "Unauthorized Access" });
                    return;
                }

                const userData = await userCollection.findOne({
                    _id: new ObjectId(_id),
                });

                if (!userData) {
                    res.status(401).send({ message: "Unauthorized Access" });
                    return;
                }

                if (
                    name !== userData.name ||
                    userName !== userData.userName ||
                    email !== userData.email ||
                    phone !== userData.phone
                ) {
                    res.status(401).send({ message: "Unauthorized Access" });
                    return;
                }

                next();
            } catch (error) {
                res.status(500).send({ message: "Internal Server Error" });
            }
        }

        //login with JWT token
        app.get("/authenticate-with-jwt", async (req, res) => {
            const token = req.headers.authorization.split(" ")[1];
            const tokenData = jwt.decode(token, process.env.JWT_SECRET);
            const { _id, role } = tokenData;
            let info = {};
            let jwtToken;

            if (role === "user") {
                info = await userCollection.findOne({ _id: new ObjectId(_id) });
            } else if (role === "seller") {
                info = await sellerCollection.findOne({
                    _id: new ObjectId(_id),
                });
            } else if (role === "admin") {
                info = await adminCollection.findOne({
                    _id: new ObjectId(_id),
                });
            }

            if (!info) {
                res.status(400).send({ message: "Password not matched" });
                return;
            }
            const { password, ...restInfo } = info;

            const sharebleInfo = { ...restInfo, role };
            jwtToken = await jwt.sign(
                {
                    _id: sharebleInfo._id,
                    name: sharebleInfo.name,
                    userName: sharebleInfo.userName,
                    email: sharebleInfo.email,
                    phone: sharebleInfo.phone,
                    slug: sharebleInfo.slug,
                    role,
                },
                process.env.JWT_SECRET,
                {
                    algorithm: "HS256",
                }
            );

            res.status(200).send({
                info: sharebleInfo,
                token: jwtToken,
            });
        });

        /****************** PRODUCTS ********************/
        //get products (using post method sothat we can get collection of category)
        app.post("/products", async (req, res) => {
            try {
                const { categories } = req.body;
                const { sort } = req.query;
                let filter = {};
                let sortFilter = {};

                if (categories && categories?.length) {
                    filter = { category: { $in: categories } };
                }

                if (sort && sort.length) {
                    switch (sort) {
                        case "popular":
                            sortFilter = { sellingCount: -1 };
                            break;
                        case "latest":
                            sortFilter = { createdAt: -1 };
                            break;
                        case "lowToHigh":
                            sortFilter = { price: 1 };
                            break;
                        case "highToLow":
                            sortFilter = { price: -1 };
                            break;
                        default:
                            break;
                    }
                }

                const cursor = productCollection
                    .find(filter)
                    .sort(sortFilter)
                    .project({
                        name: 1,
                        price: 1,
                        image: 1,
                        slug: 1,
                        seller: 1,
                        description: 1,
                        category: 1,
                    });

                const products = await cursor.toArray();
                const total = await productCollection.estimatedDocumentCount();

                res.status(200).send({ products, total });
            } catch (error) {
                console.log(error);
                res.status(500).send(error);
            }
        });

        // //get products
        // app.get("/products", async ({ res }) => {
        //     try {
        //         const cursor = productCollection.find({});
        //         const total = await productCollection.estimatedDocumentCount();

        //         const products = await cursor.toArray();
        //         res.status(200).send({ products, total });
        //     } catch (error) {
        //         res.status(500).send(error);
        //     }
        // });

        //get single product
        app.get("/product/:slug", async (req, res) => {
            try {
                const product = await productCollection.findOne({
                    slug: req.params.slug,
                });
                res.status(200).send(product);
            } catch (error) {
                res.status(500).send(error);
            }
        });

        //get products by collection
        app.get("/products/collection/:collname", async (req, res) => {
            try {
                const cursor = productCollection
                    .find({
                        collection: req.params.collname,
                    })
                    .project({
                        name: 1,
                        price: 1,
                        image: 1,
                        slug: 1,
                        seller: 1,
                    });
                // const total = await productCollection.estimatedDocumentCount();

                const products = await cursor.toArray();
                res.status(200).send(products);
            } catch (error) {
                res.status(500).send(error);
            }
        });

        //get products by category
        app.get("/products/category/:catname", async (req, res) => {
            try {
                const cursor = productCollection
                    .find({
                        category: req.params.catname,
                    })
                    .project({
                        name: 1,
                        price: 1,
                        image: 1,
                        slug: 1,
                        seller: 1,
                    });
                // const total = await productCollection.estimatedDocumentCount();

                const products = await cursor.toArray();
                res.status(200).send(products);
            } catch (error) {
                res.status(500).send(error);
            }
        });

        //get FEATURED products
        app.get("/products/featured", async ({ res }) => {
            try {
                const cursor = productCollection
                    .find({ isFeatured: true })
                    .project({
                        name: 1,
                        category: 1,
                        image: 1,
                        slug: 1,
                    });

                const products = await cursor.toArray();
                res.status(200).send(products);
            } catch (error) {
                res.status(500).send(error);
            }
        });

        //get top selling products
        app.get("/products/top-selling", async ({ res }) => {
            try {
                const cursor = productCollection
                    .find({})
                    .sort({
                        sellingCount: -1,
                    })
                    .limit(10)
                    .project({
                        name: 1,
                        price: 1,
                        image: 1,
                        slug: 1,
                        seller: 1,
                    });

                const products = await cursor.toArray();
                res.status(200).send(products);
            } catch (error) {
                res.status(500).send(error);
            }
        });

        //get latest products
        app.get("/products/latest", async ({ res }) => {
            try {
                const cursor = productCollection
                    .find({})
                    .sort({
                        createdAt: -1,
                    })
                    .limit(10)
                    .project({
                        name: 1,
                        price: 1,
                        image: 1,
                        slug: 1,
                        collection: 1,
                        seller: 1,
                    });

                const products = await cursor.toArray();
                res.status(200).send(products);
            } catch (error) {
                res.status(500).send(error);
            }
        });

        //create new products
        app.post("/products/new", verifySellerToken, async (req, res) => {
            try {
                const { data } = req?.files?.file;
                const {
                    name,
                    price,
                    category,
                    collection,
                    description,
                    seller,
                } = req.body;

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
                    seller,
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

        //get collection and category name
        app.get("/collections", async ({ res }) => {
            try {
                const cursor = collectionsCollection.find({});

                const products = await cursor.toArray();
                res.status(200).send(products);
            } catch (error) {
                res.status(500).send(error);
            }
        });

        /****************** Orders ********************/
        //post orders
        app.post("/order", verifyUserToken, async (req, res) => {
            try {
                const newOrder = req.body;
                const { products } = newOrder;
                const prodIds = products.map((p) => new ObjectId(p._id));
                const filter = { _id: { $in: prodIds } };
                const updateOperation = { $inc: { sellingCount: 1 } };

                const result = await productCollection.updateMany(
                    filter,
                    updateOperation
                );

                if (!result.acknowledged) {
                    res.status(500).send({ message: "Failed to Place Order" });
                    return;
                }

                const orderResult = await orderCollection.insertOne(newOrder);
                if (!orderResult.acknowledged) {
                    res.status(500).send({ message: "Failed to Place Order" });
                    return;
                }

                res.status(201).send({
                    message: "Your order Placed Successfully",
                });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        /*********************** AUTHENTICATION **************************/
        //login
        app.post("/login", async (req, res) => {
            try {
                const { email, password: userPassword } = req.body;
                let role = "";
                let info = {};
                let jwtToken;

                if (!email || !userPassword) {
                    res.status(400).send({
                        message: "provide all the information for login",
                    });
                    return;
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
                    return;
                }

                const { password, ...restInfo } = info;
                const result = await bcrybt.compare(userPassword, password);

                if (!result) {
                    res.status(400).send({ message: "Password not matched" });
                    return;
                }

                const sharebleInfo = { ...restInfo, role };
                jwtToken = await jwt.sign(
                    {
                        _id: sharebleInfo._id,
                        name: sharebleInfo.name,
                        userName: sharebleInfo.userName,
                        email: sharebleInfo.email,
                        phone: sharebleInfo.phone,
                        slug: sharebleInfo.slug,
                        role,
                    },
                    process.env.JWT_SECRET,
                    {
                        algorithm: "HS256",
                    }
                );

                res.status(200).send({
                    info: sharebleInfo,
                    message: "Successfully login to your account",
                    token: jwtToken,
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
                    return;
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

        //user profile photo
        app.post("/change-photo", verifyToken, async (req, res) => {
            try {
                if (!req.files.photo) {
                    res.status(400).send({ message: "File not attuched" });
                    return;
                }

                console.log(req.files.photo, req.userInfo);
                const { data } = req.files.photo;
                const { role, _id } = req.userInfo;

                let img;
                await sharp(data)
                    .resize(320)
                    .toFormat("webp")
                    .toBuffer()
                    .then((data) => (img = data))
                    .catch((err) => res.status(500).send(err));

                const encImg = img.toString("base64");

                const photo = {
                    data: Buffer.from(encImg, "base64"),
                    type: "image/webp",
                };

                let response;
                if (role === "user") {
                    response = await userCollection.updateOne(
                        { _id: new ObjectId(_id) },
                        {
                            $set: {
                                photo: photo,
                            },
                        }
                    );
                } else if (role === "seller") {
                    response = await sellerCollection.updateOne(
                        { _id: new ObjectId(_id) },
                        {
                            $set: {
                                photo: photo,
                            },
                        }
                    );
                }

                if (response.modifiedCount > 0) {
                    res.status(201).send({
                        message: "Photo Updated Successfully",
                    });
                } else {
                    res.status(500).send({
                        message: "Failed to Update",
                    });
                }
            } catch (error) {
                console.error(error);
                res.status(500).send({
                    message: "Failed to create new product",
                });
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
                    return;
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
