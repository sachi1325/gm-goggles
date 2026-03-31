#!/bin/bash
echo "Installing CGM Dashboard dependencies..."
npm install

if [ $? -eq 0 ]; then
  echo ""
  echo "Running security audit fix..."
  npm audit fix --only=prod 2>/dev/null || true
  echo ""
  echo "✓ Dependencies installed."
  echo ""
  echo "Starting CGM Dashboard..."
  npm start
else
  echo ""
  echo "✗ npm install failed. Make sure Node.js 18+ is installed: https://nodejs.org"
fi
