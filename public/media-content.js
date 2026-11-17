(() => {
 'use strict';
 function mount(deck,{media,images,initViewer,setMedia,openImage}){
  const model=window.TeachingUploadModel;
  const node=(tag,cls)=>{const el=document.createElement(tag);el.className=cls;return el;};
  deck.setMediaHooks({
   create(kind,article,index){
    let el;
    if(kind==='image'){
     el=node('figure','deck-uploaded-media');const button=node('button','image-open'),image=new Image();
     image.dataset.image='';button.type='button';button.dataset.zoom='';button.append(image);el.append(button,node('figcaption',''));
    }else{
     el=node('div','viewer deck-uploaded-media');el.dataset.deckView=index;
     const stage=node('div','video-stage'),video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';
     stage.append(video);el.append(node('div','series-options'),stage,node('div','video-tools'),node('p','video-label'));
    }
    article.append(el);return el;
   },
   apply(item,asset,original){
    const el=item.node;
    if(item.kind==='image'){
     const image=el.querySelector('img'),button=el.querySelector('[data-zoom]');
     if(asset){const k=model.key(asset);images[k]=model.url(asset);image.dataset.image=k;button.dataset.zoom=k;}
     else {image.dataset.image=original.image;button.dataset.zoom=original.image;}
     image.src=images[image.dataset.image];
     if(item.uploaded){image.alt=asset.name;el.querySelector('figcaption').textContent=asset.name;}
     button.setAttribute('aria-label','放大 '+image.alt);button.onclick=()=>openImage(button);
    }else{
     if(asset){const k=model.key(asset);media[k]={url:model.url(asset),label:asset.name,width:asset.width,height:asset.height,duration:asset.duration,fps:asset.fps,start:0};el.dataset.series=el.dataset.initial=k;}
     else {el.dataset.series=original.series;el.dataset.initial=original.initial;}
     if(el.dataset.ready){el.refreshSeries();setMedia(el,el.dataset.initial);}
     else if(!item.article.hidden)initViewer(el);
    }
    document.dispatchEvent(new CustomEvent('deck:media-item',{detail:item}));
   },
   remove(item){item.node.querySelector('video')?.pause();}
  });
 }
 window.TeachingMediaContent={mount};
})();
