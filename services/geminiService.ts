
import { GoogleGenAI, Type } from "@google/genai";
import { Product, GroundingSource } from "../types";

export interface CustomerIdentity {
  firstName: string;
  lastName: string;
  title: string;
  address: {
    city: string;
    zip_code: string;
    lines: string[];
  };
  phone: string;
}

export interface ScanResult {
  products: Product[];
  sources: GroundingSource[];
}

export const generateAIIdentities = async (countryCode: string, count: number): Promise<CustomerIdentity[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `Generate ${count} highly realistic and diverse delivery identities for the country: ${countryCode}. 
  CONTEXT: One customer is placing ${count} different orders to different locations.
  
  REQUIREMENTS:
  - Return ${count} unique delivery addresses (real cities, existing zip code formats, realistic street names for ${countryCode}).
  - For the first entry, provide a complete profile (First Name, Last Name, Title, Phone).
  - For the subsequent entries, you can vary the address significantly but keep the name and phone fields if possible, or provide varied ones (the application logic will prioritize the first one for the customer profile).
  
  Return as a JSON object with an "identities" array.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            identities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  firstName: { type: Type.STRING },
                  lastName: { type: Type.STRING },
                  title: { type: Type.STRING },
                  address: {
                    type: Type.OBJECT,
                    properties: {
                      city: { type: Type.STRING },
                      zip_code: { type: Type.STRING },
                      lines: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["city", "zip_code", "lines"]
                  },
                  phone: { type: Type.STRING }
                },
                required: ["firstName", "lastName", "address", "phone"]
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text.trim());
    return data.identities || [];
  } catch (error) {
    console.error("Identity generation error:", error);
    return [];
  }
};

export const geocodeAddress = async (city: string, countryCode: string = 'FR'): Promise<{ latitude: number, longitude: number } | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `Provide the approximate GPS coordinates (latitude and longitude) for the city: ${city}, ${countryCode}.
  Return ONLY a JSON object with "latitude" and "longitude" fields.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            latitude: { type: Type.NUMBER },
            longitude: { type: Type.NUMBER }
          },
          required: ["latitude", "longitude"]
        }
      }
    });

    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
};

export const scanWebsiteForProducts = async (url: string, limit: number): Promise<ScanResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const productTarget = Math.max(1, Math.ceil(limit / 3));

  const prompt = `Analyze the following website and extract products: ${url}. 
  MISSION: Extract at least ${productTarget} different products from the page to help reach a total target of ${limit} unique SKUs (variants).
  Identify Mother ID (product_id) and all variant information (sizes).
  
  IMPORTANT: Provide your response strictly as a JSON block inside markdown code tags.
  JSON structure example:
  { 
    "products": [ 
      { 
        "base_sku": "...", 
        "name": "...", 
        "description": "...", 
        "price": "...", 
        "currency": "...",
        "color": "...", 
        "category": "...",
        "department": "...",
        "sizes": ["S", "M"], 
        "images": ["url1"]
      } 
    ] 
  }`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    const data = JSON.parse(jsonMatch[0]);
    const rawProducts = data.products || [];
    
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || "Source",
            uri: chunk.web.uri
          });
        }
      });
    }

    const flattenedProducts: Product[] = [];
    for (const p of rawProducts) {
      if (flattenedProducts.length >= limit) break;
      const allSizes = p.sizes && p.sizes.length > 0 ? p.sizes : ["Unique"];
      const motherId = p.base_sku || `ID-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      for (let index = 0; index < allSizes.length; index++) {
        if (flattenedProducts.length >= limit) break;
        const size = allSizes[index];
        const sizeSlug = size.replace(/[^a-zA-Z0-9]/g, '');
        const uniqueSku = `${motherId}-${sizeSlug || index}`;
        const mainImg = p.images?.[0] || '';

        flattenedProducts.push({
          id: uniqueSku, 
          sku: uniqueSku,
          parentSku: motherId,
          name: p.name,
          description: p.description || "No description",
          imageUrl: mainImg,
          productUrl: url,
          price: (p.price || "0").toString(),
          comparePrice: (p.compare_price || "0").toString(),
          currency: p.currency || "EUR",
          color: p.color || "N/A",
          size: size,
          category: p.category || "uncategorized",
          department: p.department || "General",
          subdepartment: p.subdepartment || "General",
          weight: 0.4,
          length: 20,
          width: 15,
          height: 3,
          images_big: p.images || []
        });
      }
    }
    
    return {
      products: flattenedProducts.slice(0, limit),
      sources
    };
  } catch (error: any) {
    console.error("Extraction error:", error);
    throw error;
  }
};
