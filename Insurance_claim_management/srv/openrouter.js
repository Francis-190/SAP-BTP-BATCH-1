const OPENROUTER_URL =
    "https://openrouter.ai/api/v1/chat/completions";


async function analyzeClaim(claimData) {

    const apiKey =
        process.env.OPENROUTER_API_KEY;


    if (!apiKey) {
        throw new Error(
            "OPENROUTER_API_KEY is not configured"
        );
    }


    const prompt = `

You are an AI assistant for the ClaimSure
insurance claims management system.

Analyze the following insurance claim.

CLAIM INFORMATION

Claim Number:
${claimData.claimNumber}

Claim Amount:
₹${claimData.claimAmount} INR

Claim Status:
${claimData.status}

Incident Date:
${claimData.incidentDate}

Claim Description:
${claimData.description}


POLICY INFORMATION

Policy ID:
${claimData.policyID}

Policy Status:
${claimData.policyStatus}


FRAUD RISK INFORMATION

Fraud Score:
${claimData.fraudScore}

Risk Level:
${claimData.riskLevel}


Provide the analysis in the following format:

1. Risk Summary

2. Key Risk Indicators

3. Policy Observations

4. Recommended Next Action

5. Explanation

Formatting rules:

- Bold important values using Markdown.
- Bold claim number.
- Bold claim amount.
- Bold fraud score.
- Bold risk level.
- Bold policy status.
- Bold claim type.
- Bold incident date.
- Bold recommended next action.
- Use clear section headings.
- Start directly with "1. Risk Summary".
- Do not add greetings or introductory sentences.


Important response rules:

- Start immediately with "1. Risk Summary".
- Do not use greetings.
- Do not say "Of course".
- Do not say "Here is the analysis".
- Do not add introductory or conversational sentences.
- All monetary amounts are in Indian Rupees (INR).
- Do not convert INR to USD.
- Do not approve or reject the claim.
- Do not change the claim status.
- Provide analysis and recommendation only.

`;


    const response = await fetch(
        OPENROUTER_URL,
        {
            method: "POST",

            headers: {
                "Authorization":
                    `Bearer ${apiKey}`,

                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                model: "openrouter/free",

                messages: [

                    {
                        role: "user",

                        content:
                            prompt
                    }

                ]

            })
        }
    );


    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `OpenRouter error ${response.status}: ${errorText}`
        );

    }


    const result =
        await response.json();

    //console.log(result);



    return (
        result
            .choices?.[0]
            ?.message
            ?.content
        ||
        "No AI response received."
    );

}


module.exports = {
    analyzeClaim
};