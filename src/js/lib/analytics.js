import Vue from 'vue';
import VueAnalytics from 'vue-analytics';

export function loadScript(url) {
  return new Promise((resolve, reject) => {
    const head = document.head || document.getElementsByTagName('head')[0];
    const script = document.createElement('script');
    script.async = true;
    script.src = url;
    script.charset = 'utf8';

    head.appendChild(script);

    script.onload = resolve;
    script.onerror = reject;
  });
}

export function analytics({socket, router}) {
  socket.on('connect', async() => {
    await loadScript('https://ssl.google-analytics.com/ga.js');
    Vue.use(VueAnalytics, {
      id: 'UA-109413633-1',
      disableScriptLoader: true,
      router,
      autoTracking: {
        skipSamePath: true,
        exception: true,
        transformQueryString: false,
      },
    });
  });
};
