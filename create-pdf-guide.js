// Convert JUKE Project Guide to PDF
const fs = require('fs');
const path = require('path');

// Simple HTML template for PDF conversion
const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>JUKE Music Streaming Platform - Complete Guide</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: white;
        }
        
        h1 {
            color: #1db954;
            text-align: center;
            border-bottom: 3px solid #1db954;
            padding-bottom: 10px;
        }
        
        h2 {
            color: #1db954;
            border-left: 4px solid #1db954;
            padding-left: 15px;
            margin-top: 30px;
        }
        
        h3 {
            color: #333;
            margin-top: 25px;
        }
        
        .emoji {
            font-size: 1.2em;
        }
        
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            border-left: 4px solid #1db954;
        }
        
        blockquote {
            border-left: 4px solid #1db954;
            margin: 20px 0;
            padding-left: 20px;
            font-style: italic;
            color: #666;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        th {
            background-color: #1db954;
            color: white;
        }
        
        .diagram {
            background: #f9f9f9;
            border: 1px solid #ddd;
            padding: 20px;
            border-radius: 5px;
            font-family: monospace;
            text-align: center;
            margin: 20px 0;
        }
        
        .page-break {
            page-break-before: always;
        }
        
        .footer {
            margin-top: 50px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        
        .highlight {
            background-color: #fff3cd;
            padding: 15px;
            border-left: 4px solid #ffc107;
            margin: 20px 0;
        }
        
        .tip {
            background-color: #d1ecf1;
            padding: 15px;
            border-left: 4px solid #17a2b8;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    {{CONTENT}}
    
    <div class="footer">
        <p><strong>JUKE Music Streaming Platform - Complete Project Guide</strong></p>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
        <p>🎵 Your complete guide to understanding and growing your music streaming platform</p>
    </div>
</body>
</html>
`;

// Read the markdown file
const markdownPath = path.join(__dirname, 'JUKE-PROJECT-GUIDE.md');
const markdownContent = fs.readFileSync(markdownPath, 'utf8');

// Simple markdown to HTML conversion
function markdownToHtml(markdown) {
    let html = markdown;
    
    // Convert headers
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    
    // Convert bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert code blocks
    html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Convert links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Convert lists
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Convert line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // Convert blockquotes
    html = html.replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>');
    
    // Convert tables (basic)
    html = html.replace(/\|(.+)\|/g, '<tr><td>$1</td></tr>');
    html = html.replace(/<tr>/g, '<table><tr>');
    html = html.replace(/<\/tr>/g, '</tr></table>');
    
    // Clean up multiple tags
    html = html.replace(/<\/p><p>/g, '</p>\n\n<p>');
    
    return html;
}

// Convert markdown to HTML
const htmlContent = markdownToHtml(markdownContent);

// Create final HTML
const finalHtml = htmlTemplate.replace('{{CONTENT}}', htmlContent);

// Write HTML file
const htmlPath = path.join(__dirname, 'JUKE-PROJECT-GUIDE.html');
fs.writeFileSync(htmlPath, finalHtml);

console.log('🎵 JUKE Project Guide created!');
console.log(`📄 HTML file: ${htmlPath}`);
console.log('\n📋 To create PDF:');
console.log('1. Open the HTML file in your browser');
console.log('2. Press Ctrl+P (or Cmd+P on Mac)');
console.log('3. Select "Save as PDF"');
console.log('4. Adjust settings if needed');
console.log('5. Save the PDF');

// Also create a simplified text version
const textPath = path.join(__dirname, 'JUKE-PROJECT-GUIDE-TEXT.txt');
fs.writeFileSync(textPath, markdownContent);

console.log(`\n📝 Text version: ${textPath}`);

// Create a quick reference card
const quickRef = `
🎵 JUKE PLATFORM - QUICK REFERENCE

📁 KEY FILES:
├── index.html          # Main app
├── server.js           # Backend
├── database/           # Database files
├── css/                # Styles
└── js/                 # JavaScript

🗄️ DATABASE TABLES:
├── users               # User accounts
├── artists             # Music artists
├── tracks              # Songs
├── playlists           # User playlists
└── user_favorites      # Liked songs

🚀 COMMANDS:
├── node server.js      # Start app
├── node monitor.js     # View stats
├── node query-tool.js  # SQL queries
└── node test-connection.js # Test DB

🎯 FEATURES:
├── 🎵 Music upload/play
├── 📱 Mobile responsive
├── 👥 User profiles
├── 📝 Playlists
├── 💿 Media editor
└── 📊 Analytics

🔧 TROUBLESHOOTING:
├── DB issues → Set DB_SSL=false
├── Upload fails → Check file size
├── Login errors → Clear cache
└── Mobile bugs → Check mobile.css

📞 SUPPORT:
├── Check README.md
├── Use query-tool.js
├── Review dashboard.html
└── Test with monitor.js
`;

const quickRefPath = path.join(__dirname, 'JUKE-QUICK-REFERENCE.txt');
fs.writeFileSync(quickRefPath, quickRef);

console.log(`\n⚡ Quick reference: ${quickRefPath}`);
console.log('\n🎉 All documentation files created successfully!');
console.log('\n📚 Summary of files created:');
console.log('  📄 JUKE-PROJECT-GUIDE.html - Full guide (print to PDF)');
console.log('  📝 JUKE-PROJECT-GUIDE-TEXT.txt - Plain text version');
console.log('  ⚡ JUKE-QUICK-REFERENCE.txt - Quick reference card');
