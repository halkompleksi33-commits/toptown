const startSeatVideos=()=>document.querySelectorAll('.seatvideo').forEach(video=>{video.muted=true;video.play().catch(()=>{})});
new MutationObserver(startSeatVideos).observe(document.documentElement,{childList:true,subtree:true});
setInterval(startSeatVideos,1000);
