
//page
import spa from "./UI/spa.js";
spa.enrollPageByDefault();

//load resources

//转由页面驱动
import {preloaded} from "./loadResources.js";
preloaded.onloadend(_ => {
    console.log("loadend");
    spa.openPage("start_game_page");
});
