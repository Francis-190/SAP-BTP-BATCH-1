const { analyzeClaim } = require("./srv/openrouter");

async function test() {
    try {
        const result = await analyzeClaim({
            claimNumber: "CLM-TEST-001",
            claimAmount: 150000,
            status: "UnderReview",
            claimType: "Vehicle",
            claimDate: "2026-09-23",
            description: "Vehicle accident claim",

            policyNumber: "POL-1001",
            policyStatus: "Active",

            fraudScore: 82,
            riskLevel: "High"
        });

        console.log("\nAI RESPONSE:\n");
        console.log(result);
    } catch (error) {
        console.error(error);
    }
}

test();