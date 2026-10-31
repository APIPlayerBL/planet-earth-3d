export const LANGS = ['ru','en','fr','zh'];

export const UI = {
  ru: {
    appTitle: 'Планета Земля',
    langLabel: 'Язык',
    hintRotate: 'Вращайте: левая кнопка мыши или касание',
    hintZoom: 'Масштаб: колесо мыши / щипок',
    hintClick: 'Клик по точке: карточка места',
    hintDbl: 'Двойной клик: открыть в Google Maps',
    loading: 'Загрузка планеты…',
    openMaps: 'Открыть в Google Maps',
    cityType: 'Город',
    landmarkType: 'Достопримечательность',
    noDesc: 'Описание недоступно.',
    noPhoto: 'Фото недоступно',
    metaCoords: 'Координаты',
    close: 'Закрыть',
    searchPlaceholder: 'Поиск города или места…'
  },
  en: {
    appTitle: 'Planet Earth',
    langLabel: 'Language',
    hintRotate: 'Rotate: left mouse button or touch',
    hintZoom: 'Zoom: mouse wheel / pinch',
    hintClick: 'Click a point: place card',
    hintDbl: 'Double click: open in Google Maps',
    loading: 'Loading planet…',
    openMaps: 'Open in Google Maps',
    cityType: 'City',
    landmarkType: 'Landmark',
    noDesc: 'Description unavailable.',
    noPhoto: 'Photo unavailable',
    metaCoords: 'Coordinates',
    close: 'Close',
    searchPlaceholder: 'Search city or place…'
  },
  fr: {
    appTitle: 'Planète Terre',
    langLabel: 'Langue',
    hintRotate: 'Faire tourner : bouton gauche de la souris ou toucher',
    hintZoom: 'Zoom : molette / pincement',
    hintClick: 'Clic sur un point : fiche du lieu',
    hintDbl: 'Double clic : ouvrir dans Google Maps',
    loading: 'Chargement de la planète…',
    openMaps: 'Ouvrir dans Google Maps',
    cityType: 'Ville',
    landmarkType: 'Site remarquable',
    noDesc: 'Description indisponible.',
    noPhoto: 'Photo indisponible',
    metaCoords: 'Coordonnées',
    close: 'Fermer',
    searchPlaceholder: 'Rechercher une ville ou un lieu…'
  },
  zh: {
    appTitle: '地球',
    langLabel: '语言',
    hintRotate: '旋转：鼠标左键或触摸',
    hintZoom: '缩放：滚轮 / 双指',
    hintClick: '点击标记：地点卡片',
    hintDbl: '双击：在 Google 地图中打开',
    loading: '正在加载地球…',
    openMaps: '在 Google 地图中打开',
    cityType: '城市',
    landmarkType: '地标',
    noDesc: '暂无描述。',
    noPhoto: '暂无照片',
    metaCoords: '坐标',
    close: '关闭',
    searchPlaceholder: '搜索城市或地点…'
  }
};

export function t(lang, key) {
  return (UI[lang] && UI[lang][key]) || UI.en[key] || key;
}