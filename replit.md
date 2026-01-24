# 노트투게더 (NoteTogether)

## Overview
A real-time collaborative note-taking application with AI-powered proofreading features. Built with Node.js/Express, MongoDB, Socket.io, and Mistral AI.

## Project Structure
- `server.js` - Main Express server with API routes and Socket.io configuration
- `docs/` - Static frontend files (HTML, CSS, JS)
  - `models/` - Mongoose database models (User, Note, Workspace)
  - `scripts/` - Frontend JavaScript
  - `styles/` - CSS stylesheets
  - `imgs/` - Image assets
  - `svgs/` - SVG icons

## Key Features
- User authentication (register/login)
- Real-time collaborative note editing via Socket.io
- Workspace management with team invitations
- AI text proofreading using Mistral AI

## Environment Variables
- `MONGODB_URI` - MongoDB connection string
- `MISTRAL_API_KEY` - Mistral AI API key

## Running the App
The app runs on port 5000 using `node server.js`

## Deployment
Configured for autoscale deployment with `node server.js` command.
