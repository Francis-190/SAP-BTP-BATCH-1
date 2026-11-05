const cds = require("@sap/cds");
const path = require("path");
const fs = require("fs");

cds.on("bootstrap", (app) => {

    app.get("/download/pending-claims", (req, res) => {

        const filePath = path.join(
            process.cwd(),
            "exports",
            "Pending_Claims.xlsx"
        );

        console.log("Checking Excel file:", filePath);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send(
                "Pending Claims Excel file not found."
            );
        }

        res.download(
            filePath,
            "Pending_Claims.xlsx",
            (err) => {

                if (err) {
                    console.error(
                        "Excel download error:",
                        err
                    );
                }

            }
        );
    });

});

module.exports = cds.server;