# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

hatebu-ai is a React-based web application that visualizes historical Hatena Bookmark data. It fetches bookmark data from a specific user's RSS feed, processes it into histograms, and displays interactive bar charts showing bookmark activity patterns over time (1997-2025).

## Development Commands

### Essential Commands
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production (runs TypeScript compilation + Vite build)
- `npm run lint` - Run ESLint on TypeScript files
- `npm run preview` - Preview production build locally

### Data Processing Commands
- `npm run fetch` - Fetch bookmark data from RSS feed (last 100 days)
- `npm run histogram` - Generate histogram files from raw data
- `make all` - Run both fetch and histogram generation

## Architecture

### Data Flow
1. **RSS Fetching** (`scripts/fetch.ts`) - Downloads bookmark data from Hatena RSS feed with rate limiting
2. **Data Storage** - Raw data stored in hierarchical structure: `data/YYYY/MM/DD.json`
3. **Histogram Processing** (`scripts/histogram.ts`) - Aggregates raw data into frequency distributions
4. **Visualization** (`src/App.tsx`) - React component renders interactive bar charts

### Key Components
- **Frontend**: React 19 + TypeScript + Vite for fast development
- **Data Processing**: Node.js scripts using `rss-parser` for RSS feed consumption
- **Visualization**: Custom CSS-based bar charts with responsive design

### Data Structure
- **Raw data**: Array of bookmark objects with title, link, and date
- **Histogram data**: Object mapping bookmark counts to frequency (e.g., `{"5": 20}` = 20 days with 5 bookmarks)
- **Date organization**: Files organized by `YYYY/MM/DD.json` structure

## Development Notes

### RSS Feed Integration
- Fetches from `https://b.hatena.ne.jp/yuiseki/bookmark.rss?date=${YYYYMMDD}`
- Includes 0.5-second delay between requests for server respect
- Automatically skips existing files to avoid re-downloading

### Testing Data Processing
- Use `npm run histogram` to regenerate visualizations after data changes
- Check `data/histogram.json` and `data/histogram_array.json` for processed output
- Verify date range coverage from 1997 to 2025

### Frontend Development
- Main visualization logic in `src/App.tsx` with histogram rendering
- Responsive design considerations for mobile bookmark analysis
- Hover tooltips show detailed bookmark counts per frequency bucket