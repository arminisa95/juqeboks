# JUKE 🎵

A modern music streaming platform with playlist management, user collections, and social features.

## Features

- **Music Streaming** - Stream audio tracks with a beautiful player interface
- **Playlist Management** - Create, edit, and share playlists
- **User Collections (Koleqtion)** - Personal music library with favorites
- **Social Features** - Like users, comment on playlists and tracks
- **Upload System** - Upload your own tracks with cover art
- **Admin Dashboard** - Analytics and database monitoring
- **Monetization Ready** - Stripe integration for subscriptions

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Storage**: Local filesystem or S3-compatible (Cloudflare R2)
- **Authentication**: JWT tokens with bcrypt password hashing
- **Frontend**: Vanilla JavaScript SPA with CSS custom properties

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- (Optional) S3-compatible storage for file uploads

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/arminisa95/juqeboks.git
   cd juqeboks
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 in your browser

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with auto-reload |
| `npm run db:test` | Test database connection |
| `npm run db:setup` | Initialize local database |

## Project Structure

```
JUKE/
├── public/                  # Frontend static assets
│   ├── css/                 # Stylesheets
│   │   ├── variables.css    # CSS custom properties (theme)
│   │   ├── styles.css       # Main styles
│   │   └── ...              # Component-specific styles
│   ├── js/                  # Frontend JavaScript
│   │   ├── api.js           # API integration
│   │   ├── auth.js          # Authentication
│   │   ├── player.js        # Music player
│   │   ├── spa.js           # Single-page app router
│   │   └── ...              # Feature modules
│   ├── images/              # Static images
│   ├── views/               # HTML templates
│   └── index.html           # Main entry point
├── src/                     # Server-side source code
│   ├── server.js            # Express API server
│   ├── database/            # Database configuration & schemas
│   └── monetization/        # Payment integration
├── docs/                    # Documentation
│   └── showtime/            # Showtime documentation
├── scripts/                 # Utility scripts
├── uploads/                 # User-uploaded files
├── .env.example             # Environment variables template
├── .editorconfig            # Editor configuration
└── package.json             # Project dependencies
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/change-password` - Change password

### Users
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/avatar` - Upload avatar

### Tracks
- `GET /api/tracks` - List all tracks
- `POST /api/tracks` - Upload new track
- `GET /api/tracks/:id` - Get track details
- `DELETE /api/tracks/:id` - Delete track

### Playlists
- `GET /api/playlists/my` - Get user's playlists
- `POST /api/playlists` - Create playlist
- `GET /api/playlists/:id/tracks` - Get playlist tracks
- `POST /api/playlists/:id/tracks` - Add track to playlist

### Favorites
- `GET /api/favorites` - Get user's favorites
- `POST /api/favorites/:trackId` - Toggle favorite

## Environment Variables

See `.env.example` for all available configuration options.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
