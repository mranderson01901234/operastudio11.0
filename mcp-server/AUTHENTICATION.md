# MCP Server Authentication

## Current State

The HTTPS MCP server **currently has NO authentication**. It accepts all requests from localhost.

### Security Model

- ✅ **Localhost-only**: Server binds to `localhost` (127.0.0.1), only accessible from same machine
- ✅ **HTTPS**: SSL/TLS encryption for data in transit
- ❌ **No Authentication**: Any process on localhost can access the server
- ❌ **No Authorization**: No user/role-based access control

### Why This Works for Localhost

Since the server only accepts connections from `localhost`, it's protected by:
- OS network isolation (can't be accessed from other machines)
- Same-user security (runs with your user permissions)

## Adding Authentication

### Option 1: API Key Authentication (Simple)

Add an API key check:

```typescript
// In setupExpressRoutes()
const API_KEY = process.env.MCP_API_KEY || "your-secret-key";

this.app.use("/mcp", (req, res, next) => {
  const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key" });
  }
  
  next();
});
```

**Usage:**
```bash
export MCP_API_KEY=my-secret-key-123
npm run start:https:dev
```

**Claude Config:**
```json
{
  "mcpServers": {
    "operastudio-filesystem": {
      "transport": {
        "type": "http",
        "url": "https://localhost:3001/mcp",
        "headers": {
          "X-API-Key": "my-secret-key-123"
        }
      }
    }
  }
}
```

### Option 2: JWT Token Authentication

Use JWT tokens for more sophisticated auth:

```typescript
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.MCP_JWT_SECRET || "your-jwt-secret";

this.app.use("/mcp", (req, res, next) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token" });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
});
```

### Option 3: IP Whitelist

Restrict to specific IPs (useful for local network):

```typescript
const ALLOWED_IPS = (process.env.MCP_ALLOWED_IPS || "127.0.0.1").split(",");

this.app.use("/mcp", (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  if (!ALLOWED_IPS.includes(clientIp)) {
    return res.status(403).json({ error: "Forbidden: IP not allowed" });
  }
  
  next();
});
```

### Option 4: Basic Auth (Username/Password)

```typescript
import basicAuth from "express-basic-auth";

const users: Record<string, string> = {
  [process.env.MCP_USER || "admin"]: process.env.MCP_PASSWORD || "password"
};

this.app.use("/mcp", basicAuth({
  users,
  challenge: true,
  realm: "MCP Server"
}));
```

### Option 5: Integration with Next.js Auth (Clerk)

If you want to integrate with your existing Clerk authentication:

```typescript
// This would require sharing Clerk secrets or using a proxy
// More complex - not recommended for standalone MCP server
```

## Recommended Approach

For **localhost use** (current setup):
- ✅ **No auth needed** - localhost isolation is sufficient
- ✅ Keep current setup

For **production/remote access**:
- ✅ **API Key** - Simple and effective
- ✅ **JWT** - More flexible, supports expiration
- ✅ **IP Whitelist** - Additional layer

## Implementation Example

Here's a complete example adding API key auth:

```typescript
// Add to setupExpressRoutes()
const API_KEY = process.env.MCP_API_KEY;

if (API_KEY) {
  console.log("[Auth] API key authentication enabled");
  
  this.app.use("/mcp", (req, res, next) => {
    const apiKey = 
      req.headers["x-api-key"] || 
      req.headers["authorization"]?.replace("Bearer ", "") ||
      req.query.apiKey as string;
    
    if (!apiKey || apiKey !== API_KEY) {
      console.warn(`[Auth] Rejected request from ${req.ip} - invalid API key`);
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Invalid or missing API key"
      });
    }
    
    console.log(`[Auth] Authenticated request from ${req.ip}`);
    next();
  });
} else {
  console.warn("[Auth] No API key set - server accepts all localhost requests");
}
```

## Environment Variables

```bash
# API Key Auth
MCP_API_KEY=your-secret-key-here

# JWT Auth
MCP_JWT_SECRET=your-jwt-secret

# IP Whitelist
MCP_ALLOWED_IPS=127.0.0.1,192.168.1.100

# Basic Auth
MCP_USER=admin
MCP_PASSWORD=secure-password
```

## Security Best Practices

1. **Never expose to internet** without authentication
2. **Use strong API keys** (32+ random characters)
3. **Rotate keys regularly** in production
4. **Log authentication attempts** for monitoring
5. **Rate limit** authenticated endpoints
6. **Use HTTPS** (already implemented)

