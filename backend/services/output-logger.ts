// backend/services/output-logger.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LogData {
  prompt: string;
  userLocation?: {
    lat: number;
    lng: number;
    name: string;
  };
  result: string;
  venues: any[];
  events?: any[];
  mode: 'discovery' | 'route';
  queryType?: string;
  alternativesMap?: Record<string, any>;
  routes?: any[];
  executionTimeMs: number;
  tokensUsed: number;
  iterations: number;
}

/**
 * Output Logger Service
 * Saves input prompts and final outputs to text files
 */
export class OutputLogger {
  private outputDir: string;

  constructor() {
    // Define output directory path
    this.outputDir = path.join(__dirname, '..', 'outputs');
    this.ensureOutputDirectory();
  }

  /**
   * Ensure the outputs directory exists
   */
  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`📁 Created outputs directory: ${this.outputDir}`);
    }
  }

  /**
   * Generate filename with timestamp
   */
  private generateFilename(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `planmate_output_${timestamp}.txt`;
  }

  /**
   * Format venue data for text output
   */
  private formatVenue(venue: any, index: number): string {
    const lines: string[] = [];
    lines.push(`\n${index}. ${venue.name}`);
    
    if (venue.address) {
      lines.push(`   Address: ${venue.address}`);
    }
    
    if (venue.location) {
      lines.push(`   Location: ${venue.location.lat}, ${venue.location.lng}`);
    }
    
    if (venue.rating) {
      lines.push(`   Rating: ${venue.rating} ⭐`);
    }
    
    if (venue.priceLevel) {
      lines.push(`   Price Level: ${'$'.repeat(venue.priceLevel)}`);
    }
    
    if (venue.types && venue.types.length > 0) {
      lines.push(`   Types: ${venue.types.join(', ')}`);
    }
    
    if (venue.openingHours) {
      lines.push(`   Hours: ${venue.openingHours}`);
    }
    
    if (venue.phoneNumber) {
      lines.push(`   Phone: ${venue.phoneNumber}`);
    }
    
    if (venue.website) {
      lines.push(`   Website: ${venue.website}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Format routes data for text output
   */
  private formatRoutes(routes: any[]): string {
    if (!routes || routes.length === 0) return '';
    
    const lines: string[] = [];
    lines.push('\n' + '='.repeat(80));
    lines.push('🚶 ROUTE INFORMATION');
    lines.push('='.repeat(80));
    
    let totalDistance = 0;
    let totalDuration = 0;
    
    routes.forEach((route, idx) => {
      lines.push(`\nSegment ${idx + 1}: ${route.from} → ${route.to}`);
      lines.push(`   Distance: ${route.distanceFormatted}`);
      lines.push(`   Duration: ${route.durationFormatted}`);
      
      totalDistance += route.distance || 0;
      totalDuration += route.duration || 0;
    });
    
    lines.push('\n' + '-'.repeat(80));
    lines.push(`TOTAL DISTANCE: ${(totalDistance / 1000).toFixed(2)} km`);
    lines.push(`TOTAL DURATION: ${Math.round(totalDuration / 60)} minutes`);
    
    return lines.join('\n');
  }

  /**
   * Format alternatives map for text output
   */
  private formatAlternatives(alternativesMap: Record<string, any>): string {
    if (!alternativesMap || Object.keys(alternativesMap).length === 0) {
      return '';
    }
    
    const lines: string[] = [];
    lines.push('\n' + '='.repeat(80));
    lines.push('🔄 ALTERNATIVE OPTIONS');
    lines.push('='.repeat(80));
    
    Object.entries(alternativesMap).forEach(([primaryPlaceId, altInfo]: [string, any]) => {
      if (altInfo.alternatives && altInfo.alternatives.length > 0) {
        lines.push(`\nAlternatives for: ${altInfo.searchQuery || primaryPlaceId}`);
        altInfo.alternatives.forEach((alt: any, idx: number) => {
          lines.push(`  ${idx + 1}. ${alt.name}`);
          if (alt.rating) lines.push(`     Rating: ${alt.rating} ⭐`);
          if (alt.address) lines.push(`     Address: ${alt.address}`);
        });
      }
    });
    
    return lines.join('\n');
  }

  /**
   * Main method to save output to file
   */
  async saveOutput(data: LogData): Promise<string> {
    try {
      const filename = this.generateFilename();
      const filepath = path.join(this.outputDir, filename);

      // Build the output content
      const content: string[] = [];
      
      // Header
      content.push('='.repeat(80));
      content.push('PLANMATE AI - OUTPUT LOG');
      content.push('='.repeat(80));
      content.push(`Generated: ${new Date().toLocaleString()}`);
      content.push(`Mode: ${data.mode.toUpperCase()}`);
      if (data.queryType) content.push(`Query Type: ${data.queryType}`);
      content.push('='.repeat(80));
      
      // Input section
      content.push('\n📝 INPUT PROMPT');
      content.push('-'.repeat(80));
      content.push(data.prompt);
      
      // User location if provided
      if (data.userLocation) {
        content.push('\n📍 USER LOCATION');
        content.push('-'.repeat(80));
        content.push(`Name: ${data.userLocation.name}`);
        content.push(`Coordinates: ${data.userLocation.lat}, ${data.userLocation.lng}`);
      }
      
      // Agent result
      content.push('\n🤖 AGENT RESPONSE');
      content.push('-'.repeat(80));
      content.push(data.result);
      
      // Venues section
      if (data.venues && data.venues.length > 0) {
        content.push('\n🏢 VENUES / LOCATIONS');
        content.push('='.repeat(80));
        content.push(`Total Venues: ${data.venues.length}`);
        
        data.venues.forEach((venue, idx) => {
          content.push(this.formatVenue(venue, idx + 1));
        });
      }
      
      // Events section
      if (data.events && data.events.length > 0) {
        content.push('\n🎉 EVENTS');
        content.push('='.repeat(80));
        content.push(`Total Events: ${data.events.length}`);
        
        data.events.forEach((event, idx) => {
          content.push(`\n${idx + 1}. ${event.name}`);
          if (event.startDate) content.push(`   Date: ${event.startDate}`);
          if (event.location) content.push(`   Location: ${event.location}`);
          if (event.description) content.push(`   Description: ${event.description}`);
        });
      }
      
      // Routes section
      if (data.routes) {
        content.push(this.formatRoutes(data.routes));
      }
      
      // Alternatives section
      if (data.alternativesMap) {
        content.push(this.formatAlternatives(data.alternativesMap));
      }
      
      // Metadata section
      content.push('\n' + '='.repeat(80));
      content.push('📊 EXECUTION METADATA');
      content.push('='.repeat(80));
      content.push(`Execution Time: ${data.executionTimeMs}ms`);
      content.push(`Tokens Used: ${data.tokensUsed}`);
      content.push(`Iterations: ${data.iterations}`);
      
      // Footer
      content.push('\n' + '='.repeat(80));
      content.push('END OF OUTPUT');
      content.push('='.repeat(80));
      
      // Write to file
      fs.writeFileSync(filepath, content.join('\n'), 'utf-8');
      
      console.log(`✅ Output saved to: ${filepath}`);
      return filepath;
      
    } catch (error) {
      console.error('❌ Error saving output:', error);
      throw error;
    }
  }

  /**
   * Get all saved output files
   */
  listOutputFiles(): string[] {
    try {
      return fs.readdirSync(this.outputDir)
        .filter(file => file.endsWith('.txt'))
        .sort()
        .reverse(); // Most recent first
    } catch (error) {
      console.error('Error listing output files:', error);
      return [];
    }
  }

  /**
   * Read a specific output file
   */
  readOutputFile(filename: string): string {
    try {
      const filepath = path.join(this.outputDir, filename);
      return fs.readFileSync(filepath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file ${filename}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const outputLogger = new OutputLogger();