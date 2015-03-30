'use strict';
/*jshint camelcase: false, expr: true*/
//Saleforce hack---
//we have to monitor stuff on the window object
//because the liveagent code generated by Salesforce is not
//designed for angularjs.
//We create fake buttons that we give to the salesforce api so we can track
//chat availability without having to write a complete rest client.
window.fakeOnlineButton = { style: { display: 'none' } };
window.fakeOfflineButton = { style: { display: 'none' } };
//
angular.module('RedhatAccess.header').controller('ChatButton', [
    '$scope',
    'CaseService',
    'securityService',
    'strataService',
    'AlertService',
    'CHAT_SUPPORT',
    'AUTH_EVENTS',
    '$rootScope',
    '$sce',
    '$http',
    '$interval',
    function ($scope, CaseService, securityService, strataService, AlertService, CHAT_SUPPORT, AUTH_EVENTS, $rootScope, $sce, $http, $interval) {
        $scope.securityService = securityService;
        if (window.chatInitialized === undefined) {
            window.chatInitialized = false;
        }
        $scope.enableChat = function () {
            //check for has_chat attribure
            //securityService.loginStatus.authedUser.has_chat comment it now and uncomment later to be included in condition
            $scope.showChat = securityService.loginStatus.isLoggedIn && CHAT_SUPPORT.enableChat;
           // console.log("security check" +securityService.loginStatus.isLoggedIn)
           // console.log("authed user" +securityService.loginStatus.authedUser.has_chat)
           // console.log("enable chat" +CHAT_SUPPORT.enableChat)
           // console.log("show chat is "+$scope.showChat);
           // console.log("locale is "+$scope.showChat);
            return $scope.showChat;
        };
        $scope.showChat = false;

        $scope.initializeChat = function () {

        };
        $scope.openChatWindow = function () {
           var ssoName = securityService.loginStatus.authedUser.sso_username;
           var name = securityService.loginStatus.authedUser.loggedInUser;
           var chat={};
           chat.case_id=CaseService.kase.id;
           chat.customer_ssoname=ssoName;
           chat.customer_name=name;
           var locale=getCookieValue('rh_locale');
           //console.log("locale is "+locale);
           if(locale==='es')
           {
               chat.queue_id='issue:es_Chat';
           }
            else
           {
               chat.queue_id='issue:en_Chat';

           }
           //chat.queue_id='general';
            strataService.chats.chatSessionKey.post(chat).then(angular.bind(this, function (sessionKeyFromStrata) {
                BG.start(BG.START_TYPE.CHAT, {
                    sessionKey: sessionKeyFromStrata,
                    uiOptions: {
                        fallbackToFullWindow: false
                    }
                });
            }), function (error) {
                AlertService.addStrataErrorMessage(error);
            });
        };
        $scope.init = function () {
            if ($scope.enableChat()) {
                $scope.initializeChat();
            }
        };
        $scope.$on('$destroy', function () {
            //we cancel timer each time scope is destroyed
            //it will be restarted via init on state change to a page that has a chat buttom
            $interval.cancel($scope.timer);
        });
        if (securityService.loginStatus.isLoggedIn) {
            $scope.init();
        } else {
            $scope.$on(AUTH_EVENTS.loginSuccess, function () {
                $scope.init();
            });
        }

        $scope.$on('$destroy', function () {
            window._laq = null;
        });
    }
]);
