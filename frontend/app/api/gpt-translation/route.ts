import { NextResponse } from "next/server";
import { AzureOpenAI } from "openai";

export async function POST(request: Request) {
  try {
    const { text, source, target, context, messages } = await request.json();

    // Use provided context or default context
    const defaultContext = `The speaker is Jayson, from Insights and Data of Capgemini. You can shorten that to I&D Japan. Keep the use of words under a business scenario.
    For translation style: Always keep the flow of translation that sounds natural like a native speaker.`;
    
    const translationContext = context || defaultContext;
    
    // Build translation prompt
    const prompt = `Translate the following text from ${source} to ${target}:\n\n${text}
    Use the following context: 
    ${translationContext}`;
    
    const endpoint = process.env["AZURE_OPENAI_ENDPOINT"] || "https://jayso-m86ldqty-eastus2.openai.azure.com/";
    const apiKey = process.env["AZURE_OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error("Azure OpenAI API key is not set.");
    }
    const apiVersion = "2024-05-01-preview";
    const deployment = "gpt-4o-mini";

    const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });
    
    const result = await client.chat.completions.create({
      model: "gpt-4o-mini", // Specify the model to use
      messages: [
        { role: "system", content: "You are a translation assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.7,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: null,
    });

    const translation = result.choices?.[0]?.message?.content || "";
    return NextResponse.json({ translation });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json({ error: "Translation error" }, { status: 500 });
  }
}