#!/bin/bash
# Quick install + launch script

echo "Installing CGM Dashboard dependencies..."
npm install

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Dependencies installed."
  echo ""
  echo "Starting CGM Dashboard..."
  npm start
else
  echo ""
  echo "✗ npm install failed. Make sure Node.js 18+ is installed: https://nodejs.org"
fi
