import { defineStore } from 'pinia'

export const userInfoStore = defineStore('userInfo', {
  state: () => ({
    userInfo: {
      uid: 0
    },
    stashMenu: ''
  }),
  actions: {
    updateStashMenu(info) {
      this.stashMenu = info
    }
  },
  getters: {},
  persist: true
})
