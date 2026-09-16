import requests
from collections import Counter
import re
import random
from typing import List, Tuple, Optional, Dict

# =====================================================================
# CONFIGURATION & CREDENTIALS
# =====================================================================
API_KEY = ""  # Replace with your actual YouTube Data API key

def get_current_youtube_searches(seed_keyword: str) -> List[str]:
    """
    Queries YouTube's live autocomplete engine for trending user search queries.
    Automatically appends lyric modifiers to target active search intent.
    """
    modifiers = [seed_keyword, f"{seed_keyword} lyrics", f"{seed_keyword} lyric video"]
    all_suggestions = []
    
    for query in modifiers:
        url = f"https://google.com{query}"
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                import json
                raw_data = json.loads(response.text)
                if len(raw_data) > 1 and isinstance(raw_data[1], list):
                    # Extracted phrases are wrapped inside an inner array
                    suggestions = [str(item[0]) if isinstance(item, list) else str(item) for item in raw_data[1]]
                    all_suggestions.extend(suggestions)
        except Exception as e:
            print(f"Error fetching live autocomplete data for '{query}': {e}")
            
    return list(dict.fromkeys(all_suggestions))[:15]

def generate_seo_content(query: str) -> Tuple[str, str, List[str], List[str], int, Dict[str, int]]:
    """
    Scrapes the top 50 ranking lyric videos for the query, aggregates their 
    metadata, and compiles a comprehensive, high-relevance SEO package.
    """
    search_url = "https://googleapis.com"
    video_url = "https://googleapis.com"
    
    # 1. Fetch Top 50 Competitor Videos
    search_params = {
        'part': 'id,snippet',
        'q': f"{query} lyrics",
        'type': 'video',
        'maxResults': 50,
        'key': API_KEY
    }
    
    recommended_tags = ['lyrics', 'lyric video', 'sing along', 'clean lyrics', 'karaoke']
    title_words = []
    competitor_titles = []

    try:
        if API_KEY:
            search_data = requests.get(search_url, params=search_params, timeout=10).json()
            items = search_data.get('items', [])
            video_ids = [item['id']['videoId'] for item in items if 'videoId' in item['id']]
            competitor_titles = [item['snippet']['title'] for item in items]
            
            # 2. Extract Hidden Meta-Tags from Competitors
            if video_ids:
                # API permits up to 50 IDs comma-separated
                video_params = {
                    'part': 'snippet',
                    'id': ','.join(video_ids[:50]),
                    'key': API_KEY
                }
                video_data = requests.get(video_url, params=video_params, timeout=10).json()
                for item in video_data.get('items', []):
                    tags = item.get('snippet', {}).get('tags', [])
                    recommended_tags.extend(tags)
        else:
            print("[Warning] API_KEY missing. Running fallback keyword isolation.")

    except Exception as e:
        print(f"Error reaching YouTube Live API: {e}")

    # 3. Process and Clean Scraped Tags
    clean_tags = list(dict.fromkeys([tag.lower() for tag in recommended_tags]))[:40]

    # 4. Track High Frequency Keyword Clusters from Title Text
    for title in competitor_titles:
        words = re.findall(r'\b\w+\b', title.lower())
        title_words.extend(words)
        
    stop_words = {'the', 'a', 'to', 'in', 'of', 'and', 'for', 'with', 'on', 'official', 'video', 'audio', 'lyrics'}
    filtered_keywords = [word for word in title_words if word not in stop_words and not word.isdigit()]
    top_keywords = [item[0] for item in Counter(filtered_keywords).most_common(15)]

    # If API failed or key is empty, populate fallback clusters from user query
    if not top_keywords:
        top_keywords = query.lower().split() + ["lyrics", "music", "pop", "vibes"]

    # 5. Generate Target Meta Attachments
    generated_title = f"{query.title()} (Lyrics / Lyric Video)"
    
    # Music/Lyric Specific Description Template
    generated_description = (
        f"🎵 Stream/Download \"{query.title()}\": [Insert Streaming Links Here]\n\n"
        f"Enjoy the official lyric video for \"{query.title()}\". "
        f"Subscribe for more fresh, high-quality lyric presentations every week! 🚀\n\n"
        f"📝 LYRICS:\n[PASTE_EXTRACTED_WHISPER_LYRICS_HERE]\n\n"
        f"For track submission or copyright inquiries, reach out via our channel about page."
    )
    
    generated_hashtags = [f"#{word}" for word in top_keywords[:5]]
    if "#lyrics" not in generated_hashtags:
        generated_hashtags.append("#lyrics")

    # 6. Calculate Actual Optimization Quality Metric
    seo_score = 0
    if len(generated_title) <= 70: seo_score += 20
    if len(clean_tags) >= 20: seo_score += 30
    if "[PASTE_EXTRACTED_WHISPER_LYRICS_HERE]" not in generated_description: seo_score += 30
    seo_score += min(len(generated_hashtags) * 4, 20)
    
    # Static realistic analytical prediction limits for visualization
    mock_analytics = {
        "expected_reach_potential": random.randint(85, 99),
        "keyword_density_index": random.randint(75, 95)
    }

    return generated_title, generated_description, clean_tags, generated_hashtags, seo_score, mock_analytics

def process_keyword(keyword: str) -> None:
    print(f"\nAnalyzing YouTube Ecosystem and Generating Live Content Suite for '{keyword}'...")
    
    # Fetch trending lookups
    live_searches = get_current_youtube_searches(keyword)
    title, description, tags, hashtags, seo_score, analytics = generate_seo_content(keyword)

    print(f"\n{'='*80}\nLIVE COMPETITOR SEO ENGINE RESULTS\n{'='*80}")
    print(f"\nHighly Searched Variations (Autocomplete Trends):\n{', '.join(live_searches)}")
    print(f"\nOptimized Title Configuration:\n{title}")
    print(f"\nStructured Video Description Template:\n{description}")
    print(f"\nScraped & Deduplicated Competitor Tags:\n{', '.join(tags)}")
    print(f"\nRecommended Discovery Hashtags:\n{' '.join(hashtags)}")
    print(f"\nStructural SEO Health Score: {seo_score}/100")

def main():
    print("Welcome to the Active YouTube Music SEO Scraper Engine!")
    while True:
        print("\n1. Analyze Niche & Extract Metadata")
        print("2. Exit")
        choice = input("Enter your choice (1-2): ")
        
        if choice == '1':
            keyword = input("Enter artist name or base song descriptor: ")
            process_keyword(keyword)
        elif choice == '2':
            print("Closing connection interface. Goodbye!")
            break
        else:
            print("Invalid index choice.")

if __name__ == "__main__":
    main()
