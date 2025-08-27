# MCP Server Debug Guide

## Các Phương Pháp Debug MCP Server

### 1. **Logging và Monitoring**

#### Basic Logging
```bash
# Chạy server ở development mode với debug logs
DEBUG=1 npm run dev

# Hoặc set environment variable
export DEBUG=1
npm run dev
```

#### Advanced Logging
Server đã được tích hợp `DebugLogger` với các mức độ:
- `debug()`: Chỉ hiển thị khi DEBUG=1
- `info()`: Luôn hiển thị
- `error()`: Lỗi và exceptions

### 2. **Health Check**

Kiểm tra tình trạng server:
```bash
npm run health-check
```

Sẽ kiểm tra:
- ✅ Server startup
- ✅ Tools listing 
- ✅ Environment variables

### 3. **Tool Testing**

Test từng tool riêng biệt:
```bash
# Test S3 list tool
npm run test-tool -- aws_s3_list '{"bucket": "my-bucket"}'

# Test CloudWatch query
npm run test-tool -- aws_cw_logs_query '{"logGroupName": "/aws/lambda/my-function", "query": "fields @timestamp, @message | limit 10"}'
```

### 4. **Debug với Breakpoints**

#### Node.js Inspector
```bash
# Chạy với inspector (Chrome DevTools)
npm run debug

# Chạy với breakpoint ngay từ đầu
npm run debug-brk
```

Sau đó mở Chrome và vào `chrome://inspect`

#### VS Code Debugging
Thêm vào `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "runtimeArgs": ["-r", "tsx/cjs"],
      "env": {
        "DEBUG": "1"
      }
    }
  ]
}
```

### 5. **Network & AWS Debug**

#### AWS SDK Debug
```bash
# Enable AWS SDK debug
export AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE=1
export AWS_SDK_LOG_LEVEL=debug
npm run dev
```

#### AWS CLI Profile Test
```bash
# Test AWS credentials
aws sts get-caller-identity

# Test S3 access
aws s3 ls

# Test specific region
aws s3 ls --region ap-northeast-1
```

### 6. **Common Issues & Solutions**

#### Issue: Server không start được
```bash
# Check syntax errors
npm run build

# Check environment
npm run health-check

# Check ports
netstat -tulpn | grep :3000
```

#### Issue: Tool execution fails
```bash
# Test with detailed logging
DEBUG=1 npm run test-tool -- <tool-name> '<args>'

# Check AWS credentials
aws configure list

# Check AWS permissions
aws iam get-user
```

#### Issue: Timeout errors
- Tăng timeout trong environment variables:
  ```bash
  export MCP_ATHENA_TIMEOUT_MS=120000
  export MCP_CW_TIMEOUT_MS=90000
  ```

#### Issue: Memory leaks
```bash
# Monitor memory usage
node --max-old-space-size=4096 dist/index.js

# Profile memory
npm run debug
# Trong Chrome DevTools: Memory tab -> Take heap snapshot
```

### 7. **Performance Monitoring**

#### Execution Time Tracking
Logger tự động track thời gian thực thi của mỗi tool.

#### Memory Usage
```bash
# Add to your code for memory monitoring
process.memoryUsage()
```

#### Request/Response Size
Logger tự động log kích thước response.

### 8. **Integration Testing**

#### Test với Claude Desktop
1. Update `.vscode/mcp.json` với debug config:
```json
{
  "servers": {
    "aws-debug": {
      "command": "tsx",
      "args": ["src/index.ts"],
      "env": {
        "DEBUG": "1",
        "AWS_REGION": "ap-northeast-1",
        // ... other env vars
      }
    }
  }
}
```

2. Restart Claude Desktop
3. Monitor logs trong terminal

### 9. **Log Analysis**

#### Structured Logging
Logs được format với timestamp và level:
```
[DEBUG 2025-08-27T10:30:45.123Z] Tool called: aws_s3_list
[INFO 2025-08-27T10:30:45.124Z] MCP AWS server running on stdio
[ERROR 2025-08-27T10:30:45.125Z] Tool aws_s3_list execution failed
```

#### Log Filtering
```bash
# Filter by level
npm run dev 2>&1 | grep "ERROR"

# Filter by tool
npm run dev 2>&1 | grep "aws_s3_list"

# Save to file
npm run dev 2>&1 | tee debug.log
```

### 10. **Production Debugging**

#### Safe Production Debugging
```bash
# Chỉ log errors trong production
NODE_ENV=production npm start

# Log rotation
npm start 2>&1 | rotatelogs logs/mcp-server-%Y%m%d.log 86400
```

## Quick Debug Checklist

1. ✅ `npm run health-check` - Server health
2. ✅ `aws sts get-caller-identity` - AWS credentials  
3. ✅ `DEBUG=1 npm run dev` - Enable debug logs
4. ✅ `npm run test-tool -- <tool> '<args>'` - Test specific tool
5. ✅ Check `.vscode/mcp.json` configuration
6. ✅ Monitor Chrome DevTools (if using inspector)
7. ✅ Check Claude Desktop connection logs
