const state = {
  sidebarOpen: false,
  panel: null,
  commandOpen: false,
  activeTab: 'newtab',
  tabs: [{ id: 'newtab', title: 'Yeni Sekme', icon: 'G' }],
  pinned: false
};

function toggleSidebar(){ state.sidebarOpen = !state.sidebarOpen; return state.sidebarOpen; }
function openPanel(name){ state.panel = state.panel === name ? null : name; return state.panel; }
function toggleCommands(){ state.commandOpen = !state.commandOpen; return state.commandOpen; }
function addTab(tab){ state.tabs.push(tab); state.activeTab = tab.id; return tab; }
function removeTab(id){ const index = state.tabs.findIndex(t => t.id === id); if(index < 0) return false; state.tabs.splice(index,1); if(state.activeTab === id) state.activeTab = state.tabs[Math.max(0,index-1)]?.id || null; return true; }

module.exports = { state, toggleSidebar, openPanel, toggleCommands, addTab, removeTab };
