const express = require("express");


const path = require("path");

const app = express();
const publicDirectoryPath = path.join(__dirname, "public");

app.use("/public", express.static(publicDirectoryPath));
app.use(express.static(publicDirectoryPath));

app.get("/", (req, res)=>{
    res.sendFile(path.join(__dirname, "index.html"))
})

app.listen(8000)
