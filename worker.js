export default {
  async fetch(request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (!targetUrl) return new Response(JSON.stringify({error: "No URL"}), { headers: corsHeaders });

    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await response.text();

      // 抓取 Metadata
      const title = html.match(/<meta property="og:title" content="(.*?)"/)?.[1] || "未知歌名";
      const artistMatch = html.match(/歌手：(.*?)[。|\s]/);
      const artist = artistMatch ? artistMatch[1] : "未知歌手";

      // --- 強力抓取歌詞邏輯 ---
      // 搵出 <div class="lyrics"> 同 </div> 之間嘅所有內容
      const lyricsBlock = html.match(/<div class="lyrics">([\s\S]*?)<\/div>/);
      let lyrics = "未能抓取完整歌詞";

      if (lyricsBlock) {
        lyrics = lyricsBlock[1]
          .replace(/<br\s*\/?>/gi, "\n")      // 將 <br> 換成真正的換行
          .replace(/<[^>]*>/g, "")           // 移除所有 HTML 標籤
          .replace(/&nbsp;/g, " ")           // 處理空格
          .trim();
      }

      // 提取作曲作詞
      const composer = html.match(/作曲：(.*?)\s/)?.[1] || "請參考網頁";
      const lyricist = html.match(/作詞：(.*?)\s/)?.[1] || "請參考網頁";

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
      return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders });
    }
  }
};
