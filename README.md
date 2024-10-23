# 🕷️ Web Scraping Learning Journey

> **Note**: This project was created purely for learning and entertainment purposes, exploring the fascinating world of web scraping! 

## 🌐 Quick Start

You have two options to get started:

### Option 1: Use the Hosted Server (Quickest Path! 🚀)
A hosted server is currently available as of 22/10/2024. However, please note:
- Server could go offline at any time (it's a learning project after all!)
- First request takes ~10 seconds to wake up the server (just reload the page)
- Simply use the frontend and connect to the hosted API
- **Important**: The hosted (cloud) server includes a residential proxy that I personally paid for. However, it may run out of quota very soon, and I don't plan to renew it (unless I get rich or receive donations! 😄)

### Option 2: Local Setup (More Control 🛠️)
Run your own backend server:
1. Clone the repository
2. Set up the backend locally on port 4000
3. Connect your frontend to `localhost:4000`
4. **Important**: You MUST set up your own residential proxy service to avoid detection when hosting the server yourself. You can get one at [Data Impulse](https://app.dataimpulse.com/sign-in). Regular proxies or no proxy will likely be detected and blocked.

## 🎯 What's This All About?

This project is a playground for learning web scraping techniques, featuring:

- **Real-world Scraping**: Currently supports Bodega Aurrera
- **Legacy Code**: Walmart scraping code is included but disabled (due to detection issues - feel free to experiment!)
- **Data Formats**: Get your data in both JSON and CSV
- **Location Aware**: Filter results by ZIP code
- **Live Monitoring**: Real-time logs for debugging

## 🔍 API Endpoints

```markdown
GET  /scrape           # Start scraping magic
GET  /get-categories   # Fetch store categories
GET  /logs            # View real-time logs
GET  /ping            # Check server health
GET  /proxy-status    # Monitor proxy status
```

## 🚀 Getting Started

1. **Clone & Install:**
   ```bash
   git clone https://github.com/your-username/web-scraper.git
   cd web-scraper
   npm install
   ```

2. **Configure Environment:**
   ```bash
   PORT=4000
   PROXY_URL=your_residential_proxy_url    # Required for self-hosting!
   PROXY_USERNAME=your_username
   PROXY_PASSWORD=your_password
   ```

3. **Launch:**
   ```bash
   node index.js
   ```

## 🧪 Technical Details

- Built with Node.js, Express, and Puppeteer
- Requires residential proxy for reliable scraping (recommended: [Data Impulse](https://app.dataimpulse.com/sign-in))
- Supports both JSON and CSV data formats
- Real-time logging system

## ⚠️ Important Notes

- **Proxy Status**: The hosted server currently uses a residential proxy paid for by me. However, this is temporary and may stop working when the quota runs out. For reliable long-term use, please set up your own proxy service.
- **Walmart Code**: The Walmart scraping code is included but disabled due to bot detection. It's left in the codebase for educational purposes.
- **Server Availability**: The hosted server is a learning environment and may experience downtime

## 🤝 Contributing

Got ideas? Found a bug? Want to improve something? Pull requests are welcome! This is a learning project, so let's learn together.

## 📜 License

MIT License - Feel free to use this for your own learning journey!

## 🙏 Acknowledgments

Special thanks to:
- The amazing Puppeteer team
- Node.js community
- Everyone who uses this project to learn about web scraping

---

*Remember: This is a learning project - have fun exploring and experimenting with web scraping!* 🚀
