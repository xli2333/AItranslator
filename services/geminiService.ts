
import { GoogleGenAI, Type } from "@google/genai";
import { MODEL_LAYOUT_TEXT, MODEL_IMAGE_GEN } from "../constants";
import { LayoutBlock } from "../types";

const aiClients = new Map<string, GoogleGenAI>();

const getAI = (apiKey: string) => {
  const safeKey = apiKey.trim();
  if (!safeKey) {
    throw new Error("Gemini API Key 未提供");
  }

  const cached = aiClients.get(safeKey);
  if (cached) {
    return cached;
  }

  const client = new GoogleGenAI({ apiKey: safeKey });
  aiClients.set(safeKey, client);
  return client;
};

const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, "");

/**
 * Step 1: Analyze Layout & Reconstruct Content (The Storyboard)
 * Uses Gemini 3 Pro to understand the document structure deepy.
 */
export const analyzePageLayout = async (
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  customInstruction?: string
): Promise<LayoutBlock[]> => {
  const client = getAI(apiKey);
  
  const instructionPart = customInstruction 
    ? `USER CUSTOM INSTRUCTION (Must Override defaults): "${customInstruction}".` 
    : "";

  const prompt = `
    You are an expert Art Director and Web Architect. 
    Your task is to analyze this PDF page and create a "Storyboard" for a responsive HTML reconstruction.
    
    ${instructionPart}
    
    Step 1: VISUAL ANALYSIS
    - Identify the "Page Header" (recurring top elements, dates, categories). Mark as 'header'.
    - Identify the "Page Footer" (page numbers, legal text, copyrights). Mark as 'footer'.
    - Identify "Callouts" (Boxed text, sidebars, distinct background cards). Mark as 'callout'.
    - Identify "Pull Quotes" (Large, emphasized text). Mark as 'quote'.
    - Identify Main Content (Headings 'h1'-'h3', 'paragraph', 'list_item').
    - Identify Images. Mark as 'image'.
    
    Step 2: TRANSLATION & RECONSTRUCTION
    - Translate text content from ${sourceLang} to ${targetLang} (unless User Instruction says otherwise).
    - Organize the content into a logical reading flow (Storyboard).
    - Even if the PDF has multiple columns, re-flow it into a single coherent column for mobile/web reading.
    - For 'image', you MUST provide the bounding box [ymin, xmin, ymax, xmax] (0-1000 scale) so we can crop it.
    
    Return a JSON array of the storyboard blocks.
  `;

  try {
    const response = await client.models.generateContent({
      model: MODEL_LAYOUT_TEXT,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: cleanBase64(imageBase64) } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { 
                type: Type.STRING, 
                enum: ["header", "footer", "h1", "h2", "h3", "paragraph", "list_item", "caption", "quote", "callout", "image"] 
              },
              content: { type: Type.STRING, description: "The translated text content." },
              box: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: "Bounding box [ymin, xmin, ymax, xmax] (0-1000) for images only",
                nullable: true
              },
            },
            required: ["type", "content"],
          },
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data.map((item: any, index: number) => ({
        ...item,
        id: `blk-${index}-${Date.now()}`,
      }));
    }
    return [];
  } catch (error) {
    console.error("Layout Analysis Error:", error);
    return [];
  }
};

/**
 * Step 2: Translate Image Content
 */
export const translateImageBlock = async (
  imageCropBase64: string,
  targetLang: string,
  apiKey: string
): Promise<string | null> => {
  const client = getAI(apiKey);

  try {
    const response = await client.models.generateContent({
      model: MODEL_IMAGE_GEN,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: cleanBase64(imageCropBase64) } },
          { text: `Redraw this image perfectly. Translate all text inside it to ${targetLang}. Maintain the exact visual style, data points, and colors. Output only the image.` },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image Translation Error:", error);
    return null;
  }
};

/**
 * Interactive Edit: Modify existing page blocks based on user prompt
 */
export const modifyPageContent = async (
  currentBlocks: LayoutBlock[],
  userPrompt: string,
  targetLang: string,
  apiKey: string
): Promise<LayoutBlock[]> => {
  const client = getAI(apiKey);

  const prompt = `
    You are a Content Editor. The user wants to modify the following web page content.
    
    Current Blocks (JSON):
    ${JSON.stringify(currentBlocks.map(b => ({ type: b.type, content: b.content, id: b.id })))}

    User Request: "${userPrompt}"
    Target Language: ${targetLang}

    Instructions:
    - Return the UPDATED JSON array of blocks.
    - You can delete blocks, re-order blocks, or rewrite the 'content' of blocks.
    - Do NOT change the 'id' of existing blocks if you are just modifying text.
    - If adding new blocks, generate a new random id.
    - Return the full list including unchanged blocks.
  `;

  try {
    const response = await client.models.generateContent({
      model: MODEL_LAYOUT_TEXT,
      contents: { text: prompt },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { 
                type: Type.STRING, 
                enum: ["header", "footer", "h1", "h2", "h3", "paragraph", "list_item", "caption", "quote", "callout", "image"] 
              },
              content: { type: Type.STRING },
              // We don't strictly need box/imageUrl here as the AI usually just edits text, 
              // but if it deletes an image block, that's fine.
            },
            required: ["type", "content", "id"],
          },
        },
      },
    });

    if (response.text) {
      const newStructure = JSON.parse(response.text);
      
      // Merge back strictly to preserve ImageURLs and Boxes if the ID matches
      return newStructure.map((newItem: any) => {
        const original = currentBlocks.find(b => b.id === newItem.id);
        if (original) {
          return {
            ...original,
            content: newItem.content,
            type: newItem.type, // Allow type change
          };
        }
        return newItem; // New block
      });
    }
    return currentBlocks;
  } catch (error) {
    console.error("Modification Error:", error);
    return currentBlocks;
  }
};
