// App.js - complete for Nkundino Mini Supermarket
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { firestore } from "./firebaseConfig.js";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
//import admin from 'firebase-admin';


// Custom HTTP and HTTPS Agents
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

// Set longer timeout and more robust connection settings
axios.defaults.timeout = 60000 * 3; // 3 minutes
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://triviatrialsmessaging.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(bodyParser.json());

// WhatsApp API Credentials
const ACCESS_TOKEN =
  "EAAQYaGPHZBD0BOy9b3acDU6ywehiKJarISySO1XUSITOQwNgUeFqnBjuKtjPfPLJNxdsGlN08DCehUwpZCvQZCjQp9G63XeKWiZC86iYemL5E8Rb9hozG46ZBgQZBGHtSBZBUGXmvkZCZA5TZBPlCfheoeYYz5VvpDfyHbEjqvtAA9MXzi43n1lQB9lrF2ymUPCHyfHAZDZD"; //"EAAXxaUQfr3gBO5XDpAF6ZCFo1GIjruy4YgqiJMElgpaawXMCrXWBpSHGiB1aSf2hmkSzJhJLG3N14Uan8Axghepb2ftoMBcOkaKv9aOs5j8BUQZASbhrM95qFn6dPeYawQZAi2sFzdW6uJRW2HSL8CteNsAbYn3783HuuVeFAPfk7ETE1ZATvRSWZBpDS6UDyBQZDZD";
//const PHONE_NUMBER_ID = 
const VERSION = "v22.0";

// Global in-memory store for user contexts
const userContexts = new Map();
//userContexts.clear()

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});



//// From here - readable modular functions.

const handleMobileMoneySelection = async (buttonId, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone);
  if (!userContext) {
    console.log("No user context found for phone:", phone);
    return;
  }

  const vendorNumber = "320297"; // Default to Rwanda
  const currentCurrency = userContext.currency || "RWF"; // Default to Rwanda
  let callToActionMessage = "";

  if (currentCurrency === "RWF") {
    // Payment messages for Rwanda
    if (buttonId === "mtn_momo") {
      callToActionMessage = `*Pay*\nPlease pay with\nMTN MoMo to ${vendorNumber}, name Nkundino Mini Supermarket`;
    } else if (buttonId === "airtel_mobile_money") {
      callToActionMessage = `*Pay*\nPlease pay with\nAirtel Money to ${vendorNumber}, name Nkundino Mini Supermarket`;
    } else {
      console.log("Unrecognized mobile money option for Rwanda:", buttonId);
      return;
    }
  } else if (currentCurrency === "XOF") {
    // Payment messages for Togo
    if (buttonId === "mtn_momo") {
      callToActionMessage = `Veuillez payer avec\nMTN Mobile Money au ${vendorNumber}, nom Nkundino Mini Supermarket\n____________________\nVotre commande est en cours de traitement et sera livrée sous peu.`;
    } else if (buttonId === "airtel_mobile_money") {
      callToActionMessage = `Veuillez payer avec\nAirtel Money au ${vendorNumber}, nom Nkundino Mini Supermarket\n____________________\nVotre commande est en cours de traitement et sera livrée sous peu.`;
    } else {
      console.log("Unrecognized mobile money option for Togo:", buttonId);
      return;
    }
  } else {
    console.log("Unsupported currency:", currentCurrency);
    return;
  }

  const redirectPayload = {
    type: "text",
    text: { body: callToActionMessage },
  };

  await sendWhatsAppMessage(phone, redirectPayload, phoneNumberId);
};



const handleOrder = async (message, changes, displayPhoneNumber, phoneNumberId) => {
  const order = message.order;
  const orderId = message.id;
  const customerInfo = {
    phone: changes.value.contacts[0].wa_id,
    receiver: displayPhoneNumber,
  };
  const items = order.product_items;
  const totalAmount = items.reduce(
    (total, item) => total + item.item_price * item.quantity,
    0
  );

  // Save the order details into userContext
  const userContext = userContexts.get(customerInfo.phone) || {};
  userContext.order = {
    orderId,
    customerInfo,
    items,
    totalAmount,
  };
  userContexts.set(customerInfo.phone, userContext);

  try {

    await sendOrderPrompt(customerInfo.phone, phoneNumberId);

    console.log("Order saved successfully.");
  } catch (error) {
    console.error("Error saving order:", error.message);
  }
};




const handleTextMessages = async (message, phone, phoneNumberId) => {
  const messageText = message.text.body.trim().toLowerCase();

  switch (messageText) {
    case "adminclear":
      userContexts.clear();
      console.log("All user contexts reset.");
      break;

    case "clear":
      userContexts.delete(phone);
      console.log("User context reset.");
      break;

    case "haha":
      console.log("User requested the menu.");
      // Provide an array of categories available.
      const categories1 = [
        "Juice",
        //"margarine",
        //"dairy-products",
        "Rice",
        "Flour and Composite flour",
        "Cooking And Olive Oil",
        "Bread And Bakery Items",
        "Vegetables",
        "Fruits",
        "Mayonaise / Ketchup / Mustard",
        //"tooth-brush-and-mouth-wash",
        "Body soaps",
        "Lotion",
        //"shampoo-conditioner",
      ];
      await sendCategoryList(phone, phoneNumberId, categories1);
      break;
    case "products":
      console.log("User requested the menu.");
      // Provide an array of categories available.
      const categories2 = [
        "Juice",
        //"margarine",
        //"dairy-products",
        "Rice",
        "Flour and Composite flour",
        "Cooking And Olive Oil",
        "Bread And Bakery Items",
        "Vegetables",
        "Fruits",
        "Mayonaise / Ketchup / Mustard",
        //"tooth-brush-and-mouth-wash",
        "Body soaps",
        "Lotion",
        //"shampoo-conditioner",
      ];
      await sendCategoryList(phone, phoneNumberId, categories2);
      break;
    case "nkundino":
      console.log("User requested the menu.");
      // Provide an array of categories available.
      const categories3 = [
        "Juice",
        //"margarine",
        //"dairy-products",
        "Rice",
        "Flour and Composite flour",
        "Cooking And Olive Oil",
        "Bread And Bakery Items",
        "Vegetables",
        "Fruits",
        "Mayonaise / Ketchup / Mustard",
        //"tooth-brush-and-mouth-wash",
        "Body soaps",
        "Lotion",
        //"shampoo-conditioner",
      ];
      await sendCategoryList(phone, phoneNumberId, categories3);
      break;



    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};






const handleLocation = async (location, phone, phoneNumberId) => {
  try {
    const userContext = userContexts.get(phone);
    if (!userContext || !userContext.order) {
      console.log("No order found in user context.");
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "No active order found. Please place an order first." },
        },
        phoneNumberId
      );
      return;
    }
    const { orderIdx, customerInfo, items } = userContext.order;
    const catalogProducts = await fetchFacebookCatalogProducts();
    const enrichedItems = items.map((item) => {
      const productDetails = catalogProducts.find(
        (product) => product.retailer_id === item.product_retailer_id
      );
      return {
        product: item.product_retailer_id,
        quantity: item.quantity,
        price: item.item_price,
        currency: item.currency,
        product_name: productDetails?.name || "Unknown Product",
        product_image: productDetails?.image_url || "defaultImage.jpg",
      };
    });
    const currencies = enrichedItems[0].currency;
    let vendorNumber = "+250788767816";
    let currentCurrency = "RWF";
    let countryCodeText = "RW";
    if (currencies === "XOF") {
      vendorNumber = "+22892450808";
      currentCurrency = "XOF";
      countryCodeText = "TG";
    }
    function orderNumber() {
      const randomNum = Math.floor(1 + Math.random() * (10000000 - 1));
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const formattedNum = randomNum.toString().padStart(6, "0");
      return `ORD-${dateStr}-${formattedNum}`;
    }
    const orderidd = orderNumber();
    const orderData = {
      orderId: orderidd,
      phone: customerInfo.phone,
      currency: currentCurrency,
      countryCode: countryCodeText,
      amount: enrichedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      products: enrichedItems,
      user: `+${customerInfo.phone}`,
      date: new Date(),
      paid: false,
      rejected: false,
      served: false,
      accepted: false,
      vendor: vendorNumber,
      deliveryLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    };
    const docRef = await firestore
      .collection("whatsappOrdersNkundino")
      .add(orderData);
    console.log("Order saved successfully to Firebase with ID:", docRef.id);

    try {
      const orderDoc = await docRef.get();
      const orderData = orderDoc.data();
      await axios.post(
        `https://triviatrialsmessaging.onrender.com/api/send-order-confirmation`,
        {
          orderId: orderData.orderId,
        }
      );
      console.log(
        "Order confirmation endpoint triggered for order:",
        orderData.orderId
      );
    } catch (error) {
      console.error(
        "Error triggering order confirmation endpoint:",
        error
      );
    }

    await sendWhatsAppMessage(
      phone,
      {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "Proceed to payment" },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: "mtn_momo", title: "MTN MoMo" },
              },
            ],
          },
        },
      },
      phoneNumberId
    );

    userContext.stage = "EXPECTING_MTN_AIRTEL";
    userContext.docReference = docRef;
    userContext.vendorNumber = vendorNumber;
    userContext.currency = currentCurrency;
    userContexts.set(phone, userContext);
    console.log("Location updated and order saved successfully.");
  } catch (error) {
    console.error("Error processing location and saving order:", error.message);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: `Sorry, there was an error processing your location: ${error.message}. Please try again.`,
        },
      },
      phoneNumberId
    );
  }
};



const processedMessages = new Set();



// Webhook endpoint for receiving messages
app.post("/webhook", async (req, res) => {
  if (req.body.object === "whatsapp_business_account") {
    const changes = req.body.entry?.[0]?.changes?.[0];
    const messages = changes.value?.messages;
    const phoneNumberId = changes.value?.metadata?.phone_number_id;

    if (!changes || !messages || !phoneNumberId) {
      return res.status(400).send("Invalid payload.");
    }

    // Only process the first message in the array
    const message = messages[0];
    const phone = message.from;
    const uniqueMessageId = `${phoneNumberId}-${message.id}`;

    if (processedMessages.has(uniqueMessageId)) {
      console.log("Duplicate message ignored:", uniqueMessageId);
      return res.sendStatus(200);
    }

    processedMessages.add(uniqueMessageId);


    try {
      if (phoneNumberId === "611707258686108") {
        await handlePhoneNumber2Logic(message, phone, changes, phoneNumberId);
      } else {
        console.warn("Unknown phone number ID:", phoneNumberId);
      }
    } catch (err) {
      console.error("Error processing message:", err.message);
    } finally {
      setTimeout(() => processedMessages.delete(uniqueMessageId), 300000);
    }
  }

  res.sendStatus(200);
});





async function handlePhoneNumber2Logic(message, phone, changes, phoneNumberId) {
  switch (message.type) {
    case "order":
      await handleOrder(
        message,
        changes,
        changes.value.metadata.display_phone_number,
        phoneNumberId
      );
      break;

    case "text":
      await handleTextMessages(message, phone, phoneNumberId);

      const userContext = userContexts.get(phone) || {};
      if (userContext.stage === "EXPECTING_TIN") {
        const tin = message.text.body.trim();
        if (tin) {
          console.log(`User ${phone} provided TIN: ${tin}`);
          // Store the TIN or process it as required
          // Update the context to expect the location
          userContext.tin = tin;  // Save the TIN
          userContext.stage = "EXPECTING_MTN_AIRTEL"; // Move to location stage
          userContexts.set(phone, userContext);
          const docReferenc = userContext.docReference;
          // Later, when you want to update the same document
          await docReferenc.update({
            TIN: userContext.tin  // Replace 'userProvidedTIN' with the actual TIN value you receive from the customer

          });

          // Call the order confirmation endpoint
          try {
            // Get the orderId from the document reference
      const orderDoc = await docReferenc.get();
      const orderData = orderDoc.data();
      
            await axios.post(`https://triviatrialsmessaging.onrender.com/api/send-order-confirmation`, {
              orderId: orderData.orderId
            });
            console.log("Order confirmation endpoint triggered for order:", orderData.orderId);
          } catch (error) {
            console.error("Error triggering order confirmation endpoint:", error);
            // Don't throw the error as we don't want to affect the main order flow
          }

          await sendWhatsAppMessage(phone, {
            type: "interactive",
            interactive: {
              type: "button",
              body: {
                text: "Proceed to payment",
              },
              action: {
                buttons: [
                  { type: "reply", reply: { id: "mtn_momo", title: "MTN MoMo" } },
                  // {
                  //   type: "reply",
                  //   reply: { id: "airtel_mobile_money", title: "Airtel Money" },
                  // },
                ],
              },
            },
          }, phoneNumberId);

          return;  // Exit early after processing TIN
        } else {
          await sendWhatsAppMessage(phone, {
            type: "text",
            text: {
              body: "Invalid TIN. Please provide a valid TIN.",
            },
          }, phoneNumberId);
          return;
        }
      }
      break;

      case "interactive":
        if (message.interactive.type === "button_reply") {
          const buttonId = message.interactive.button_reply.id;
      
          // Handle order confirmation/cancellation buttons
          if (buttonId.startsWith('confirm_') || buttonId.startsWith('cancel_')) {
            const orderId = buttonId.split('_')[1];
      
            // Find the order in Firestore
            const orderSnapshot = await firestore.collection("whatsappOrdersNkundino")
              .where("orderId", "==", orderId)
              .get();
      
            if (!orderSnapshot.empty) {
              const docRef = orderSnapshot.docs[0].ref;
              const orderData = orderSnapshot.docs[0].data();
              const customerPhone = orderData.phone; // Get customer's phone number
      
              if (buttonId.startsWith('confirm_')) {
                await docRef.update({
                  paid: true
                });
                await sendWhatsAppMessage(customerPhone, {
                  type: "text",
                  text: {
                    body: `*Thank you*\nWe received your payment successfully! Your order is being processed and will be delivered soon`
                  }
                }, phoneNumberId);
              } else if (buttonId.startsWith('cancel_')) {
                await docRef.update({
                  rejected: true
                });
                await sendWhatsAppMessage(customerPhone, {
                  type: "text",
                  text: {
                    body: `*Oops*\nOrder cancelled. Please contact us on +250788640995`
                  }
                }, phoneNumberId);
              }
            }
            return;
          }
          
          // Move CHECKOUT and MORE handlers outside the previous if block
          else if (buttonId === 'CHECKOUT') {
            // Send location request message
            const locationRequestPayload = {
              type: "interactive",
              interactive: {
                type: "location_request_message",
                body: {
                  text: "Share your delivery location",
                },
                action: {
                  name: "send_location",
                },
              },
            };
      
            await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);
            return;
          } 
          else if (buttonId === 'MORE') {
            const categories = [
        "Juice",
        //"margarine",
        //"dairy-products",
        "Rice",
        "Flour and Composite flour",
        "Cooking And Olive Oil",
        "Bread And Bakery Items",
        "Vegetables",
        "Fruits",
        "Mayonaise / Ketchup / Mustard",
        //"tooth-brush-and-mouth-wash",
        "Body soaps",
        "Lotion",
        //"shampoo-conditioner",
      ];
            await sendCategoryList(phone, phoneNumberId, categories);
            return;
          }
      
          // Handle MTN/Airtel selection
          const userContext = userContexts.get(phone) || {};
          if (userContext.stage === "EXPECTING_MTN_AIRTEL") {
            await handleMobileMoneySelection(buttonId, phone, phoneNumberId);
            console.log("Expecting MTN & AIRTEL button reply");
            return;
          }
        } 
        else if (message.interactive.type === "list_reply") {
          const selectedCategory = message.interactive.list_reply.id;
          console.log("User selected category:", selectedCategory);
          await sendCatalogForCategory(phone, phoneNumberId, selectedCategory);
        }
        break;



    case "location":
      await handleLocation(message.location, phone, phoneNumberId);
      break;

    default:
      console.log("Unrecognized message type:", message.type);
  }
}









// Webhook verification
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "icupatoken31";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Verification failed!");
    }
  }
});

// Function to format phone number
const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
};

// Function to test WhatsApp connection
async function testWhatsAppConnection() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/me`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    console.log("WhatsApp connection test successful:", response.data);
    return true;
  } catch (error) {
    console.error(
      "WhatsApp connection test failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

// Unified message sending function
async function sendWhatsAppMessage(phone, messagePayload, phoneNumberId) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;

    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formatPhoneNumber(phone),
        ...messagePayload,

      },
    });

    console.log(`Message sent successfully from ${phoneNumberId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(
      `WhatsApp message sending error from ${phoneNumberId}:`,
      error.response?.data || error.message
    );
    throw error;
  }
}


function capitalizeCategory(category) {
  // Split by hyphen and capitalize each word
  return category.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCategoryTitle(category) {
  // First capitalize as before
  const capitalized = category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  
  // Then truncate to 24 characters if needed
  return capitalized.length > 24 
    ? capitalized.substring(0, 21) + "..." 
    : capitalized;
}

/**
 * Sends an interactive list message showing all categories.
 * When a user selects a category, your webhook should receive the selection and trigger sending catalog items.
 */
async function sendCategoryList(phone, phoneNumberId, categories) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;

    // Build list items from categories; each row's id is the category name.
    const rows = categories.map(cat => ({
      id: cat, // use the category name (or ID) as the row id
      title: formatCategoryTitle(cat),
      //description: `See our ${cat} products`
    }));

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: "Welcome to Nkundino Mini Supermarket App!"
        },
        body: {
          text: "Please choose a category to view products:"
        },
        footer: {
          text: "Get your groceries delivered"
        },
        action: {
          button: "Select Category",
          sections: [
            {
              title: "Categories",
              rows: rows
            }
          ]
        }
      }
    };

    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: payload
    });

    console.log("Category list sent successfully to:", phone);
    return response.data;
  } catch (error) {
    console.error("Error sending category list:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Sends a catalog message for a single chunk of up to 30 products.
 * The catalog message uses interactive type "product_list".
 */
async function sendCatalogChunk(phone, phoneNumberId, category, productRetailerIdsChunk) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: {
          type: "text",
          text: category  // Display the category as the header
        },
        body: { text: "Our products:" },
        action: {
          catalog_id: "3886617101587200", // Replace with your actual catalog id
          sections: [
            {
              title: category,
              product_items: productRetailerIdsChunk.map(id => ({
                product_retailer_id: id
              }))
            }
          ]
        }
      }
    };

    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: payload
    });

    console.log(`Catalog chunk sent successfully for category ${category}`);
    return response.data;
  } catch (error) {
    console.error("Error sending catalog chunk:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Splits an array into chunks of a given size.
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Given a category, fetches product retailer IDs from Firestore.
 * It queries the "nkundinoproducts" collection where "category" equals the provided category.
 * The returned array uses the document ID as the product retailer ID.
 */
async function fetchProductRetailerIDs(category) {
  try {
    const snapshot = await firestore.collection("nkundinoproducts")
      .where("category", "==", category)
      .get();
    if (snapshot.empty) {
      console.warn("No products found for category:", category);
      return [];
    }
    // Use the document id as product retailer id.
    return snapshot.docs.map(doc => doc.id);
  } catch (error) {
    console.error("Error fetching products for category:", category, error.message);
    return [];
  }
}

/**
 * For a given category, fetches product IDs from Firestore and sends catalog messages in chunks.
 */
async function sendCatalogForCategory(phone, phoneNumberId, category) {
  const productRetailerIds = await fetchProductRetailerIDs(category);
  if (!productRetailerIds || productRetailerIds.length === 0) {
    console.error("No product IDs fetched for category:", category);
    return;
  }
  const chunks = chunkArray(productRetailerIds, 30);
  for (const chunk of chunks) {
    await sendCatalogChunk(phone, phoneNumberId, category, chunk);
    // Optional delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}







app.post("/api/save-order", async (req, res) => {
  console.log("Incoming order data:", req.body);

  const { orderId, customerInfo, items, deliveryLocation } = req.body;

  try {
    // Validate incoming data
    if (!orderId || !customerInfo || !items || items.length === 0) {
      return res.status(400).json({ message: "Invalid order data" });
    }

    // Fetch all catalog products to enrich order items
    const catalogProducts = await fetchFacebookCatalogProducts();

    // Enrich items with product details from Facebook Catalog
    const enrichedItems = items.map((item) => {
      const productDetails = catalogProducts.find(
        (product) => product.retailer_id === item.product_retailer_id
      );

      return {
        product: item.product_retailer_id,
        quantity: item.quantity,
        price: item.item_price,
        currency: item.currency,
        product_name: productDetails?.name || "Unknown Product",
        product_image: productDetails?.image_url || "defaultImage.jpg",
      };
    });

    // Determine the vendor number based on currency
    const currencies = enrichedItems[0].currency; //enrichedItems.map((item) => item.currency);
    let vendorNumber = "+250788767816"; // Default to Rwandan number
    let currentCurrency = "RWF";
    // currencies.includes("XOF")
    if (currencies == "XOF") {
      vendorNumber = "+22892450808"; // Togo number
      currentCurrency = "XOF"; // Togo currency
    }

    let currentOrder = 0;



    function orderNumber() {


      const randomNum = uuidv4().split('-')[0];
      currentOrder += 1;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      //return `ORD-${dateStr}-${randomNum.toString()}`;
      // Format the random number to always be 6 digits
      const formattedNum = randomNum.slice(0, 6).padStart(6, "0");

      return `ORD-${dateStr}-${formattedNum}`;
      //randomNum.toString().padStart(6, "0")}
    }

    const orderidd = orderNumber();

    // Prepare Firestore document data
    const orderData = {
      orderId: orderidd,
      phone: customerInfo.phone,
      currency: currentCurrency,
      amount: enrichedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      products: enrichedItems,
      user: `+${customerInfo.phone}`,
      date: new Date(),
      paid: false,
      rejected: false,
      served: false,
      accepted: false,
      vendor: vendorNumber,
      tin: "",
      deliveryLocation: deliveryLocation || null // Add location data
    };

    // Save order to Firestore
    const docRef = await firestore.collection("whatsappOrdersNkundino").add(orderData);

    console.log("Order saved successfully with ID:", docRef.id);

    res
      .status(200)
      .json({ message: "Order saved successfully", order: orderData });
  } catch (error) {
    console.error("Error saving order:", error.message);
    res
      .status(500)
      .json({ message: "An error occurred while saving the order" });
  }
});


async function fetchFacebookCatalogProducts() {
  const url = `https://graph.facebook.com/v12.0/3886617101587200/products?fields=id,name,description,price,image_url,retailer_id`;
  let products = [];
  let nextPage = url;

  try {
    while (nextPage) {
      const response = await axios.get(nextPage, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      });

      // Append fetched products to the list
      products = products.concat(response.data.data);

      // Update nextPage with the next page link
      nextPage = response.data.paging?.next || null;
    }

    console.log("Fetched products with images:", products);
    return products;
  } catch (error) {
    console.error(
      "Error fetching catalog products:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function sendOrderPrompt(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `*Your order’s looking good!*\nWant to add anything else before checkout?` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "MORE", title: "More" } },
          { type: "reply", reply: { id: "CHECKOUT", title: "Checkout" } }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  userContext.stage = "SEND_TIN_MESSAGE";
  userContexts.set(phone, userContext);
}

// Add this new endpoint for sending order confirmation message
app.post("/api/send-order-confirmation", async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Get the active admin phone number from Firebase
    const adminPhoneSnapshot = await firestore
      .collection("adminPhone")
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (adminPhoneSnapshot.empty) {
      return res.status(400).json({ message: "No active admin phone number found" });
    }

    const ADMIN_PHONE = adminPhoneSnapshot.docs[0].data().number;

    // Get the order details
    const orderSnapshot = await firestore
      .collection("whatsappOrdersNkundino")
      .where("orderId", "==", orderId)
      .get();

    if (orderSnapshot.empty) {
      return res.status(404).json({ message: "Order not found" });
    }

    const orderData = orderSnapshot.docs[0].data();
    const docRef = orderSnapshot.docs[0].ref;
    
    const orderDetails = orderData.products
      .map(
        (product) =>
          `${product.product_name} x${product.quantity} - ${
            product.price * product.quantity
          } ${product.currency}`
      )
      .join("\n");

    const messageBody = `New Order Received!\n\nOrder ID: ${orderData.orderId}\nCustomer Phone: ${orderData.phone}\nTotal Amount: ${orderData.amount} ${orderData.currency}\n\nItems:\n${orderDetails}\n\nPlease confirm or cancel this order.`;

    const messagePayload = {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: messageBody },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: `confirm_${orderId}`, title: "Confirm" },
            },
            {
              type: "reply",
              reply: { id: `cancel_${orderId}`, title: "Cancel" },
            },
          ],
        },
      },
    };

    await sendWhatsAppMessage(ADMIN_PHONE, messagePayload, "611707258686108");
    
    res.status(200).json({
      message: "Order confirmation message sent successfully to admin",
      adminPhone: ADMIN_PHONE // Optional: return the phone number used
    });
    
  } catch (error) {
    console.error("Error sending order confirmation:", error);
    res.status(500).json({ 
      message: "Failed to send order confirmation message",
      error: error.message 
    });
  }
});

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  testWhatsAppConnection();
});
