import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CACHE_DIR = path.resolve('src/data/cache');
const REELS_DIR = path.resolve(CACHE_DIR, 'reels');
const PUBLIC_DIR = path.resolve('public/reels');
const MAIN_JSON = path.resolve(CACHE_DIR, 'plan-me-a-5-day-trip-to-switzerland-under-3k-with-lots-of-adventure-in-it.json');

// Ensure public reels directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

function downloadFile(url, dest) {
    if (!url) return false;
    // Skip if already exists
    if (fs.existsSync(dest)) {
        console.log(`    Already exists: ${path.basename(dest)}`);
        return true;
    }
    try {
        // Using curl with 30s timeout and follow redirects
        execSync(`curl -s -L --max-time 30 -o "${dest}" "${url}"`, { stdio: 'pipe' });
        // Check if file was actually created and has content
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
            return true;
        }
        return false;
    } catch (e) {
        console.error(`    Failed: ${e.message}`);
        return false;
    }
}

function main() {
    console.log('Reading main JSON file...');
    const rawData = fs.readFileSync(MAIN_JSON, 'utf8');
    const plan = JSON.parse(rawData);

    // Iterate through days and items
    for (const day of plan.days) {
        for (let i = 0; i < day.items.length; i++) {
            const item = day.items[i];

            if (item.hasReel && item.instagramSearchTerm) {
                console.log(`Processing ${item.name} (${item.instagramSearchTerm})...`);

                const reelJsonPath = path.resolve(REELS_DIR, `${item.instagramSearchTerm}.json`);

                if (fs.existsSync(reelJsonPath)) {
                    const reelData = JSON.parse(fs.readFileSync(reelJsonPath, 'utf8'));
                    const itemDir = path.resolve(PUBLIC_DIR, item.instagramSearchTerm);

                    if (!fs.existsSync(itemDir)) {
                        fs.mkdirSync(itemDir, { recursive: true });
                    }

                    // Download Main Video
                    if (reelData.videoUrl) {
                        const mainVideoPath = path.resolve(itemDir, 'main.mp4');
                        console.log(`  Downloading main video...`);
                        if (downloadFile(reelData.videoUrl, mainVideoPath)) {
                            item.videoUrl = `/reels/${item.instagramSearchTerm}/main.mp4`;
                        }
                    }

                    // Download Gallery Items
                    if (reelData.gallery && Array.isArray(reelData.gallery)) {
                        item.gallery = [];
                        console.log(`  Processing gallery items...`);

                        for (let gIndex = 0; gIndex < reelData.gallery.length; gIndex++) {
                            const galleryItem = reelData.gallery[gIndex];

                            if (galleryItem.type === 'video' && galleryItem.url) {
                                const galleryVideoPath = path.resolve(itemDir, `gallery_${gIndex}.mp4`);
                                console.log(`    Downloading gallery video ${gIndex}...`);

                                if (downloadFile(galleryItem.url, galleryVideoPath)) {
                                    const newGalleryItem = {
                                        type: 'video',
                                        url: `/reels/${item.instagramSearchTerm}/gallery_${gIndex}.mp4`
                                    };

                                    // Try to download thumbnail if available
                                    if (galleryItem.thumbnail) {
                                        const thumbPath = path.resolve(itemDir, `thumb_${gIndex}.jpg`);
                                        if (downloadFile(galleryItem.thumbnail, thumbPath)) {
                                            newGalleryItem.thumbnail = `/reels/${item.instagramSearchTerm}/thumb_${gIndex}.jpg`;
                                        }
                                    }

                                    item.gallery.push(newGalleryItem);
                                }
                            }
                        }
                    }
                } else {
                    console.warn(`  Reel JSON not found for ${item.instagramSearchTerm}`);
                }
            }
        }
    }

    console.log('Writing updated JSON file...');
    fs.writeFileSync(MAIN_JSON, JSON.stringify(plan, null, 2));
    console.log('Done!');
}

main();
