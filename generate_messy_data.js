const XLSX = require('xlsx');
const fs = require('fs');

// Arrays to mix and match for realistic "messy" enterprise descriptions
const baseItems = [
    { baseDesc: "MS PIPE SCH40 2IN", category: "Mechanical" },
    { baseDesc: "Mild Steel Seamless Pipe 2-inch", category: "Mechanical" },
    { baseDesc: "MS TUBING 50MM", category: "Mechanical" },
    { baseDesc: "SS Bolt Hex 10MM", category: "Electrical" },
    { baseDesc: "Stainless Steel Hexagonal Bolt M10", category: "Electrical" },
    { baseDesc: "G.I. Wire 4mm Heavy Duty", category: "Electrical" },
    { baseDesc: "Galvanized Iron Wire 4 MM", category: "Electrical" },
    { baseDesc: "PVC Insulated Cable 3 Core", category: "Electrical" },
    { baseDesc: "3-Core PVC Flexible Cable", category: "Electrical" },
    { baseDesc: "Industrial Ball Valve 1 inch", category: "Mechanical" },
    { baseDesc: "Valve, Ball, 1-IN Brass", category: "Mechanical" },
    { baseDesc: "Heavy Duty Carbon Steel Flange", category: "Mechanical" },
    { baseDesc: "CS Flange Class 150", category: "Mechanical" }
];

const typosOrVariations = [
    (str) => str,
    (str) => str.toLowerCase(),
    (str) => str.toUpperCase(),
    (str) => str.replace(/2/g, 'two').replace(/4/g, 'four'),
    (str) => "URGENT: " + str,
    (str) => str + " - OLD STOCK",
    (str) => str.replace(/IN/g, 'Inch').replace(/MM/g, 'Millimeter')
];

const locations = [
    "Ranchi Hub, Jharkhand",
    "Mumbai Port, Maharashtra",
    "Kolkata Central Depot, West Bengal",
    "Chennai Logistics Yard, Tamil Nadu",
    "Hyderabad Hub, Telangana",
    "Visakhapatnam Steel Yard, Andhra Pradesh",
    "Ahmedabad Gujarat Store",
    "Delhi NCR Distribution Center"
];

// Generate ~120 rows of messy data
let rows = [];
for (let i = 1; i <= 120; i++) {
    const template = baseItems[Math.floor(Math.random() * baseItems.length)];
    const modifier = typosOrVariations[Math.floor(Math.random() * typosOrVariations.length)];
    const messyDescription = modifier(template.baseDesc);
    const location = locations[Math.floor(Math.random() * locations.length)];

    rows.push({
        "description": messyDescription,
        "category": template.category,
        "location": location
    });
}

// Create workbook and worksheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "MessyInventory");

// Write to file
const fileName = "massive_messy_inventory.xlsx";
XLSX.writeFile(wb, fileName);

console.log(`✅ Generated "${fileName}" with ${rows.length} messy rows successfully!`);
console.log(`-> You can now upload this file directly into your Tr2 Bulk Upload module.`);