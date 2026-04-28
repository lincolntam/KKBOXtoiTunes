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
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' }
      });
      const html = await response.text();

      // 提取 Meta 資訊
      const title = html.match(/<meta property="og:title" content="(.*?)"/)?.[1] || "未知歌名";
      const artistMatch = html.match(/歌手：(.*?)[。|\s]/);
      const artist = artistMatch ? artistMatch[1] : "未知歌手";

      // --- 完整歌詞提取 ---
      // KKBOX 網頁版歌詞放在 <div class="lyrics">...</div> 內
      const lyricsBlock = html.match(/<div class="lyrics">([\s\S]*?)<\/div>/);
      let lyrics = "未能抓取完整歌詞";

      if (lyricsBlock) {
        lyrics = lyricsBlock[1]
          .replace(/<br\s*\/?>/gi, "\n")  // 關鍵：將 <br> 變回換行
          .replace(/<[^>]*>/g, "")       // 移除所有 HTML 標籤
          .replace(/&nbsp;/g, " ")
          .trim();
      }

      // 提取作曲作詞
      const composer = html.match(/作曲：(.*?)\s/)?.[1] || "請參考網頁";
      const lyricist = html.match(/作詞：(.*?)\s/)?.[1] || "請參考網頁";

      return new Response(JSON.stringify({ title, artist, composer, lyricist, lyrics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json;charset=UTF-8" }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders });
    }
  }
};
