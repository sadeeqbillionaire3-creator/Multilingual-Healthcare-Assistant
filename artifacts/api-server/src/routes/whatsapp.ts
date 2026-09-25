import { Router } from "express";
const router = Router();

// GET for verification
router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "smart_sadeeq_verify_2026";
  
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST for messages
router.post("/whatsapp", async (req, res) => {
  console.log("WhatsApp message received:", JSON.stringify(req.body, null, 2));
  
  const body = req.body;
  if (body.object) {
    // Here we will later add Gemini AI response
  }
  
  res.sendStatus(200);
});

export default router;