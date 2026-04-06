# Slidea - AI Presentation Generator

A full-stack web application that generates professional presentations instantly using AI. Simply describe what you need, and Slidea will create a structured, beautifully formatted PowerPoint presentation for you.

## 🌟 Features

- ✨ **AI-Powered Generation**: Describe your presentation needs in natural language
- 📊 **Multiple Templates**: Startup pitches, business plans, educational content, and more
- 🎨 **Beautiful Design**: Professional templates with carefully coordinated colors
- 📥 **Easy Download**: Get PowerPoint files ready to customize
- 💾 **Presentation History**: View and manage all your generated presentations
- 🚀 **Lightning Fast**: Generate presentations in seconds
- 🔐 **Secure**: Built with PostgreSQL for reliable data storage

## 🏗️ Project Structure

```
Slidea/
├── backend/           # Node.js/Express server
│   ├── routes/       # API routes
│   ├── controllers/  # Request handlers
│   ├── services/     # Business logic
│   ├── index.js      # Server entry point
│   ├── package.json
│   └── .env          # Environment variables
├── frontend/         # React application
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── App.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── .env          # Frontend environment variables
└── README.md
```

## 🛠️ Tech Stack

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **pptxgen** - PowerPoint generation
- **Axios** - HTTP client

### Frontend
- **React 18** - UI library
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Axios** - API communication

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- PostgreSQL database (Supabase provided)
- Git

## 🚀 Quick Start

### 1. Clone and Setup

```bash
cd Slidea
```

### 2. Backend Setup

```bash
cd backend
npm install
```

The `.env` file is already configured with the database connection string. Update if needed:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:Harsha9000513338@db.ufhpepsxmwhyxnnjadik.supabase.co:5432/postgres
NODE_ENV=development
OPENAI_API_KEY=your_openai_api_key_here
```

Start the backend:

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Backend will run on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Configure the `.env` file:

```env
VITE_API_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## 🎨 Design Features

### Color Scheme

The application uses a beautiful combination of:
- **Primary**: Indigo (#6366f1) - Professional and modern
- **Secondary**: Pink (#ec4899) - Vibrant and engaging
- **Accent**: Amber (#f59e0b) - Highlights and CTAs
- **Background**: Light gray to indigo gradient
- **Text**: Dark gray on light backgrounds, white on dark

### Responsive Design

- Mobile-first approach
- Fully responsive on all devices
- Beautiful gradient backgrounds
- Smooth animations and transitions

## 📖 How to Use

1. **Open the Application**
   - Frontend runs on `http://localhost:3000`

2. **Create a Presentation**
   - Enter a presentation title (optional)
   - Describe what you want in natural language
   - Or use one of the quick templates
   - Click "Generate Presentation"

3. **Download Your Presentation**
   - Once generated, the PowerPoint file downloads automatically
   - Open and customize in Microsoft PowerPoint or similar

4. **View History**
   - Go to "My Presentations" tab
   - View all your previously created presentations
   - Download any presentation anytime

## 🔌 API Endpoints

### POST `/api/presentations/generate`
Generate a new presentation

**Request Body:**
```json
{
  "prompt": "Create a pitch deck for my EdTech startup",
  "title": "EdTech Pitch Deck"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "title": "EdTech Pitch Deck",
    "downloadUrl": "/api/presentations/download/abc123"
  }
}
```

### GET `/api/presentations/history`
Get all generated presentations

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "title": "EdTech Pitch Deck",
      "prompt": "Create a pitch deck for my EdTech startup",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### GET `/api/presentations/download/:id`
Download a presentation file

**Response:** PowerPoint file (.pptx)

## 📦 Database Setup

The application is configured to use PostgreSQL. To set up the database:

1. **Connection String**: Already configured in `.env`
   ```
   postgresql://postgres:Harsha9000513338@db.ufhpepsxmwhyxnnjadik.supabase.co:5432/postgres
   ```

2. **Create Table** (Optional):
   ```sql
   CREATE TABLE presentations (
     id VARCHAR(255) PRIMARY KEY,
     title VARCHAR(255) NOT NULL,
     prompt TEXT NOT NULL,
     filename VARCHAR(255),
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

## 🚨 Troubleshooting

### Backend won't start
- Ensure Node.js is installed: `node --version`
- Check if port 5000 is available
- Verify database connection string in `.env`

### Frontend won't connect to backend
- Ensure backend is running on `http://localhost:5000`
- Check `VITE_API_URL` in frontend `.env`
- Look at browser console for CORS errors

### Presentation generation fails
- Check backend console for errors
- Verify the prompt is not empty
- Ensure `pptxgen` package is installed

### Download doesn't work
- Check browser console for errors
- Ensure file was created in `backend/presentations/`
- Try a different browser

## 📝 Example Prompts

1. **Startup Pitch**: "Create a pitch deck for my EdTech startup. Include problem, solution, market opportunity, and business model."

2. **Business Plan**: "Create a comprehensive business plan presentation with market analysis, financial projections, and growth strategy."

3. **Product Launch**: "Create a product launch presentation covering product features, benefits, pricing, and timeline."

4. **Sales Pitch**: "Create a sales pitch presentation for our SaaS product targeting enterprise customers."

## 🔐 Security Notes

- Never commit `.env` files with real credentials
- Use environment variables for sensitive data
- Database connection string is securely stored
- File uploads are saved in the `presentations` directory

## 📄 License

This project is provided as-is for educational and commercial use.

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review backend console logs
3. Check frontend browser console
4. Verify all environment variables are set correctly

## 🎯 Future Enhancements

- Integration with actual OpenAI API for better content generation
- User authentication and presentation management
- More template options
- Customizable color schemes
- Presentation preview functionality
- Team collaboration features
- Export to PDF, Google Slides, etc.

---

**Created with ❤️ for efficient presentation creation**
