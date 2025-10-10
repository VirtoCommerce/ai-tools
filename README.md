# vc-mcp-testing-module

Repository for Playwright MCP + LLM tests prompts

## Overview

This project provides a comprehensive testing framework that combines Playwright automation with Model Context Protocol (MCP) for LLM-powered test generation and execution. It's designed to work with Cursor, Kiro, and Claude code IDEs.

## Prerequisites

- **IDE**: Cursor, Kiro, or Claude code IDE
- **MCP Server**: Playwright MCP server must be installed and configured
- **Node.js**: Version 18 or higher
- **Playwright**: Browser automation framework

## MCP Configuration

### 1. Install Playwright MCP Server

The project uses `@playwright/mcp` package for MCP integration. 

**For Cursor IDE:**
1. Go to Cursor Settings -> MCP -> Add new MCP Server
2. Name it to your liking (e.g., "playwright mcp")
3. Use command type with the command: `npx @playwright/mcp@latest`
4. You can also verify config or add command arguments via clicking Edit

**Example MCP Configuration:**
```json
{
  "mcpServers": {
    "playwright mcp msedge": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--browser",
        "chrome"
      ]
    }
  }
}
```

### 2. Environment Configuration

Create a `.env` file in the project root with the following required variables:

```env
# Application URLs
FRONT_URL=https://your-frontend-url.com
BACK_URL=https://your-backend-url.com

# Admin Credentials
ADMIN=your_admin_username
ADMIN_PASSWORD=your_admin_password

# User Credentials
USER_EMAIL=test_user@example.com
USER_PASSWORD=test_password
```

### 3. Verify Environment Variables

Use the provided script to check if all required environment variables are set:

```bash
npm run env:check
```

### 4. MCP Server Setup

Follow the official Playwright MCP documentation for detailed setup instructions:
- [Playwright MCP GitHub Repository](https://github.com/microsoft/playwright-mcp)

## MCP Integration

The project is configured to work with MCP-enabled IDEs. The MCP server provides:
- Browser automation capabilities
- Test execution through natural language prompts
- Screenshot and accessibility testing
- Cross-browser testing support

## Browser Support

The configuration supports multiple browsers:
- Chromium (Desktop Chrome)
- Firefox
- WebKit (Safari)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)
