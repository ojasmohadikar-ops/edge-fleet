const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


// ================= HOME =================

app.get("/", (req, res) => {
    res.json({
        message: "EDGE-FLEET Backend is running 🚛"
    });
});


// ================= VEHICLES =================

app.get("/api/vehicles", (req, res) => {

    res.json([
        {
            id: "MH31AB1234",
            driver: "Rahul",
            status: "Active",
            fuel: 78,
            location: "Nagpur"
        },
        {
            id: "MH31CD5678",
            driver: "Amit",
            status: "Active",
            fuel: 65,
            location: "Wardha Road"
        },
        {
            id: "MH31EF9012",
            driver: "Rohit",
            status: "Idle",
            fuel: 42,
            location: "Hingna"
        }
    ]);

});


// ================= ALERTS =================

app.get("/api/alerts", (req, res) => {

    res.json([
        {
            vehicle: "MH31EF9012",
            alert: "Low Fuel",
            fuel: 42
        }
    ]);

});


// ================= SERVER =================

app.listen(5050, () => {

    console.log(
        "EDGE-FLEET server running on http://localhost:5050"
    );

});