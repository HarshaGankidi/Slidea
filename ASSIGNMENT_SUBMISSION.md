# Slidea - AI Presentation Generator
## Assignment Submission

This is a complete full-stack web development project for generating AI-powered presentations.

### 📦 What's Included

1. **Backend (Node.js/Express)**
   - REST API for presentation generation
   - PowerPoint file generation
   - PostgreSQL integration (optional)
   - Located in: `backend/`

2. **Frontend (React/Vite)**
   - Beautiful, responsive UI
   - Tailwind CSS styling
   - Light colors with dark accents
   - Located in: `frontend/`

3. **Database**
   - PostgreSQL (Supabase)
   - Connection string already configured
   - Database is optional (local file storage works)

### 🚀 Quick Start

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed instructions.

**5-Minute Setup:**

```bash
# Terminal 1: Backend
cd backend
npm install
npm start

# Terminal 2: Frontend
cd frontend
npm install
npm run dev

# Open browser: http://localhost:3000
```

### 📋 Project Structure

```
Slidea/
├── backend/
│   ├── routes/              # API endpoints
│   ├── controllers/         # Request handlers
│   ├── services/            # Business logic
│   ├── presentations/       # Generated files
│   ├── index.js            # Server
│   ├── package.json
│   └── .env                # Configuration
├── frontend/
│   ├── src/
│   │   ├── components/     # React UI
│   │   ├── services/       # API client
│   │   └── App.jsx         # Main app
│   ├── index.html
│   ├── package.json
│   └── .env                # Configuration
└── Documentation files
```

### ✨ Features

✅ **AI Presentation Generation**
- User enters natural language prompt
- Backend generates structured presentation
- Multiple templates included

✅ **Beautiful UI**
- Gradient backgrounds (Indigo to Pink)
- Responsive design (mobile-friendly)
- Light colors with dark accents
- Professional color scheme
- Smooth animations

✅ **Download Functionality**
- Generate PowerPoint files (.pptx)
- Auto-download after generation
- Manual download from history

✅ **Presentation History**
- View all generated presentations
- Download any time
- Shows creation date and prompt

### 🎨 Design Features

**Color Scheme:**
- Primary: Indigo (#6366f1)
- Secondary: Pink (#ec4899)
- Accent: Amber (#f59e0b)
- Light backgrounds with professional gradients

**Components:**
- Beautiful header
- Generator form with templates
- Presentation history cards
- Responsive grid layout
- Smooth transitions and hover effects

### 🔑 Key Files

**Backend entry:** `backend/index.js`
**Frontend entry:** `frontend/src/main.jsx`
**Presentation service:** `backend/services/presentationService.js`
**API client:** `frontend/src/services/api.js`

### 🔌 API Endpoints

- `POST /api/presentations/generate` - Generate presentation
- `GET /api/presentations/history` - Get presentation list
- `GET /api/presentations/download/:id` - Download file
- `GET /api/health` - Health check

### 📊 Database

**Connection String (Already Configured):**
```
postgresql://postgres:Harsha9000513338@db.ufhpepsxmwhyxnnjadik.supabase.co:5432/postgres
```

Located in: `backend/.env`

The application works without database (local file storage).

### 🧪 Verification

Run setup verification:
```bash
node verifySetup.js
```

### 📖 Documentation

- [Main README](./README.md) - Complete project overview
- [Setup Guide](./SETUP_GUIDE.md) - Detailed setup instructions
- [Backend README](./backend/README.md) - Backend documentation
- [Frontend README](./frontend/README.md) - Frontend documentation

### 🎯 Requirements Met

✅ Separate frontend and backend folders
✅ .env files configured for each
✅ PostgreSQL connection string configured
✅ Beautiful UI with light and dark colors
✅ Coordinated color scheme throughout
✅ Presentation download functionality
✅ Complete working solution
✅ Setup instructions provided

### 🚀 Deployment Ready

- Backend can be deployed to: Render, Heroku, AWS, etc.
- Frontend can be deployed to: Vercel, Netlify, GitHub Pages
- Environment variables ready for production

### 📞 Support

For setup help, see [SETUP_GUIDE.md](./SETUP_GUIDE.md)

---

**Ready to generate presentations! 🎉**
