import QtQuick
import QtQuick.Window
import QtWebChannel
import QtWebEngine

// The app's one window. mpv draws into it first (MpvRenderer), and the
// web view over that, so the video shows wherever the page is
// transparent. `app` is the Application object.
Window {
    id: window

    title: "Matinee"
    // What shows while nothing has drawn yet, and behind a page that is
    // transparent with no video under it. Where the video is on a surface
    // of its own under the window, the window clears to nothing while
    // there is a picture, so that it shows.
    color: app.videoShown && app.videoUnderWindow ? "transparent" : "black"
    width: 1280
    height: 720
    minimumWidth: 480
    minimumHeight: 320

    onClosing: app.windowClosing()

    // The bridge's page end goes in front of every page's own scripts,
    // in the page's own world, so the page finds it there.
    Component.onCompleted: {
        const script = WebEngine.script()
        script.name = "matinee-desktop-bridge"
        script.sourceCode = app.transportScript
        script.injectionPoint = WebEngineScript.DocumentCreation
        script.worldId = WebEngineScript.MainWorld
        script.runsOnSubframes = false
        app.profile.userScripts.insert(script)
    }

    WebChannel {
        id: channel
        Component.onCompleted: registerObject("bridge", app.bridge)
    }

    WebEngineView {
        id: view

        anchors.fill: parent
        focus: true
        profile: app.profile
        webChannel: channel
        // See-through only while there is video to see. Qt WebEngine takes
        // a page's own background for the view's as soon as the page has
        // one, and from then on draws the view as opaque, even once the
        // page is transparent again. Setting the color anew, each time a
        // video starts, is what makes it see-through again.
        backgroundColor: app.videoShown ? "transparent" : "black"
        zoomFactor: app.scale

        settings.fullScreenSupportEnabled: true
        settings.playbackRequiresUserGesture: false
        settings.javascriptCanAccessClipboard: true
        settings.focusOnNavigationEnabled: true
        settings.navigateOnDropEnabled: false
        settings.pdfViewerEnabled: false
        // A page that didn't load is the app's to explain, with its own.
        settings.errorPageEnabled: false

        onUrlChanged: app.pageChanged(url)
        onLoadingChanged: info => {
            if (info.status === WebEngineView.LoadSucceededStatus) {
                // A new page starts at the default size again.
                zoomFactor = app.scale
            } else if (info.status === WebEngineView.LoadFailedStatus) {
                app.loadFailed(info.url, info.errorString)
            }
        }
        onNavigationRequested: request => {
            if (request.isMainFrame && !app.allowsNavigation(request.url)) {
                request.reject()
            }
        }
        // A link that opens a new tab has no tab to open here.
        onNewWindowRequested: request => app.openExternally(request.requestedUrl)
        onFullScreenRequested: request => {
            request.accept()
            app.setFullscreen(request.toggleOn)
        }
        onPermissionRequested: permission => {
            if (permission.permissionType === WebEnginePermission.PermissionType.ClipboardReadWrite) {
                permission.grant()
            } else {
                permission.deny()
            }
        }
        // The page has its own menus. Text fields and selected text keep
        // the system's, for copy and paste.
        onContextMenuRequested: request => {
            request.accepted = !request.isContentEditable && request.selectedText.length === 0
        }
        onRenderProcessTerminated: (status, code) => app.pageCrashed(status, code)
        onJavaScriptConsoleMessage: (level, message, line, source) => app.pageLogged(level, message, line, source)
    }

    Connections {
        target: app

        function onNavigate(url) {
            // Setting the address it already has does nothing.
            if (view.url.toString() === url.toString()) {
                view.reload()
            } else {
                view.url = url
            }
        }
    }

    // Keys that have to work whatever the page does.
    Shortcut {
        sequence: "F11"
        context: Qt.ApplicationShortcut
        onActivated: app.setFullscreen(window.visibility !== Window.FullScreen)
    }
    Shortcut {
        // A way to the server list from a page that offers none, like a
        // proxy's error page.
        sequence: "Ctrl+Shift+S"
        context: Qt.ApplicationShortcut
        onActivated: app.showServers()
    }
    Shortcut {
        sequences: ["Media Play", "Toggle Media Play/Pause"]
        context: Qt.ApplicationShortcut
        onActivated: app.mediaKey("toggle")
    }
    Shortcut {
        sequence: "Media Pause"
        context: Qt.ApplicationShortcut
        onActivated: app.mediaKey("pause")
    }
    Shortcut {
        sequence: "Media Stop"
        context: Qt.ApplicationShortcut
        onActivated: app.mediaKey("stop")
    }
    Shortcut {
        sequence: "Media Next"
        context: Qt.ApplicationShortcut
        onActivated: app.mediaKey("next")
    }
    Shortcut {
        sequence: "Media Previous"
        context: Qt.ApplicationShortcut
        onActivated: app.mediaKey("previous")
    }
}
