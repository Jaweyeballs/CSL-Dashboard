/**
 * New Brunswick campus badge options + CSL hosted.
 * Campus colors match Rutgers WebReg schedule legend.
 * CSL hosted events keep Rutgers scarlet (#CC0033).
 */
export const CAMPUSES = [
  {
    id: 'csl',
    optionLabel: 'CSL hosted event',
    badgeLabel: 'CSL',
    color: '#CC0033',
    textColor: '#ffffff',
  },
  {
    id: 'college-ave',
    optionLabel: 'College Ave',
    badgeLabel: 'College Ave',
    color: '#FFFFC1',
    textColor: '#1a1205',
  },
  {
    id: 'busch',
    optionLabel: 'Busch',
    badgeLabel: 'Busch',
    color: '#BDEFFF',
    textColor: '#1a1205',
  },
  {
    id: 'livingston',
    optionLabel: 'Livingston',
    badgeLabel: 'Livingston',
    color: '#FFD3B4',
    textColor: '#1a1205',
  },
  {
    id: 'cook-doug',
    optionLabel: 'Cook/Doug',
    badgeLabel: 'Cook/Doug',
    color: '#C8FFC8',
    textColor: '#1a1205',
  },
];

const byId = Object.fromEntries(CAMPUSES.map((c) => [c.id, c]));

const LEGACY = {
  'new-brunswick': 'college-ave',
  newark: 'livingston',
  camden: 'cook-doug',
};

export function getCampus(id) {
  return byId[id] || byId.csl;
}

export function normalizeCampusId(value) {
  let id = String(value || '').trim().toLowerCase();
  if (LEGACY[id]) id = LEGACY[id];
  return byId[id] ? id : 'csl';
}
