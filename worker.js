export default {
  async fetch(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    // 設定 CORS Header，確保你的 GitHub 網頁可以順利呼叫這個 Worker
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 處理瀏覽器的預檢請求 (Preflight request)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!targetUrl || !targetUrl.includes('kkbox.com')) {
      return new Response(JSON.stringify({ error: "請提供有效的 KKBOX 連結" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      // 模擬真實瀏覽器訪問，避免被阻擋
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-HK,zh-TW;q=0.9,en;q=0.8'
        }
      });

      if (!response.ok) throw new Error("無法讀取 KKBOX 網頁");

      const html = await response.text();

      // 1. 提取歌名 (從 Open Graph Title)
      const title = html.match(/<meta property="og:title" content="(.*?)"/)?.[1] || "未知歌名";

      // 2. 提取歌手 (從 Open Graph Description)
      const artistMatch = html.match(/歌手：(.*?)。/);
      const artist = artistMatch ? artistMatch[1] : "未知歌手";

      // 3. 提取完整歌詞 (核心邏輯)
      // KKBOX 的歌詞通常放在 class="lyrics" 的 div 中
      const lyricsMatch = html.match(/<div class="lyrics">([\s\S]*?)<\/div>/);
      let lyrics = "未能抓取完整歌詞";
      
      if (lyricsMatch) {
        lyrics = lyricsMatch[1]
          .replace(/<br\s*\/?>/gi, "\n") // 將 <br> 標籤轉為換行符
          .replace(/<[^>]*>/g, "")      // 去除所有其餘 HTML 標籤
          .trim();
      }

      // 4. 提取作曲與作詞人 (利用正規表達式搜尋文本)
      const composerMatch = html.match(/作曲：(.*?)\s/);
      const lyricistMatch = html.match(/作詞：(.*?)\s/);
      const composer = composerMatch ? composerMatch[1].replace(/<\/?[^>]+(>|$)/g, "") : "詳見網頁";
      const lyricist = lyricistMatch ? lyricistMatch[1].replace(/<\/?[^>]+(>|$)/g, "") : "詳見網頁";

      // 回傳結構化 JSON 資料
      return new Response(JSON.stringify({
        title,
        artist,
        composer,
        lyricist,
        lyrics
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json;charset=UTF-8" }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};