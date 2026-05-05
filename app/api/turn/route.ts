import { NextResponse } from "next/server";

export async function GET() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const apiKey = process.env.TWILIO_API_KEY!;
  const apiSecret = process.env.TWILIO_API_SECRET!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      Ttl: "3600",
    }),
  });

  const data = await res.json();

  return NextResponse.json(data);
}