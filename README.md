# 🏫 My School App - Backend

Welcome to the **backend of My School App**, the powerhouse that handles authentication, AI assistant queries, lesson management, chat systems, and more.  

Built with **Fastify**, **TypeScript**, and **MongoDB**, this backend ensures speed, reliability, and security for all users of the school app.

---

## 🌟 Features

- **Role-Based API Endpoints**
  - Parent, Student, Teacher, Admin roles with proper authorization.
- **AI Assistant Integration**
  - Supports multiple AI providers: OpenAI, Deepseek, HuggingFace, Cohere, Grok.
  - Automatically selects a working provider if one fails.
- **User Authentication**
  - Google OAuth login
  - JWT-based session management
- **Lesson Planner**
  - Teachers can create, update, and manage lessons.
- **Real-Time Chat Support**
  - Handles messaging, deletion, and user-specific chat actions.
- **Theme Settings**
  - Provides theme data for frontend integration.
- **Secure & Scalable**
  - Sensitive data never exposed
  - Ready for deployment on Render

---

## 🚀 Tech Stack

- **Server:** Fastify, TypeScript  
- **Database:** MongoDB & Mongoose  
- **Authentication:** Google OAuth, JWT  
- **AI Integrations:** OpenAI, Deepseek, HuggingFace, Cohere, Grok  
- **Email Verification:** Nodemailer  
- **Deployment:** Render (Backend)

---

## ⚡ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/MPKDev-Codebeat13/MPK-School-App-Backend/.git
   cd MPK-School-App-Backend

    Install dependencies

npm install

Create a .env file in the root directory:

MONGO_URI=your_mongo_connection_string
PORT=your_port
CLIENT_URL=your_url
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=your_redirect_uri
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
HUGGINGFACE_API_KEY=your_huggingface_key
COHERE_API_KEY=your_cohere_key


Run the server locally

    npm run dev

📦 Folder Structure

src/
├── controllers/     # Request handlers for routes
├── models/          # Mongoose schemas
├── routes/          # API route definitions
├── utils/           # Helpers: email, JWT, AI calls
├── server.ts        # Fastify server entry
└── plugins/         # Fastify plugins and middlewares

🧑‍💻 Usage

    AI Assistant

        POST /api/parent/ai-assistant or /api/student/ai-assistant with question body.

    User Authentication

        Google OAuth: /api/auth/google

        JWT-based protected routes for all sensitive actions

    Lesson Planner

        CRUD routes for lessons by teachers

    Chat

        POST messages, DELETE only your messages, GET chat history

🔒 Security Notes

    JWT authentication protects sensitive routes.

    User data is never stored in localStorage for safety.

    API keys are kept in environment variables, never in source code.

    Role-based access control ensures users only access allowed resources.

🌐 Deployment

    Backend hosted on Render (free plan)

    Connects seamlessly with the frontend hosted on Netlify

🙌 Author

MPK – Full-stack prodigy and Anime Lover.
GitHub: https://github.com/MPKDev-Codebeat13
💌 Feedback

Open issues, request features, or leave a ⭐ if you love the project!
