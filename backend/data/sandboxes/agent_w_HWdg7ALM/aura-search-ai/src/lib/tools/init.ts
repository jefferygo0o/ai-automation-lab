// ==========================================
// Tool Registry Initializer
// This file exists solely to trigger tool self-registration on import.
// Import this in any module that needs tools available.
// All tools register themselves via registerTool() on module load.
// ==========================================

import "./webSearchTool";
import "./fetchWebpageTool";
import "./summarizePageTool";
import "./calculatorTool";
import "./weatherTool";
import "./browserTool";
