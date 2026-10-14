Page({onLoad(options={}){wx.redirectTo({url:'/pages/index/index'+(options.preview==='1'&&getApp().isDevtools?'?preview=1&intro=1':'')});}});
