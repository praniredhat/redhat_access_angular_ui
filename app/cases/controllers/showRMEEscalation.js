'use strict';

import hydrajs  from '../../shared/hydrajs';

export default class ShowRmeEscalation {
    constructor($scope, RHAUtils, CaseService, AlertService, strataService, $stateParams, gettextCatalog) {
        'ngInject';

        $scope.CaseService = CaseService;
        $scope.submittingRequest = false;
        $scope.escalationMessage = 'Request Management Escalation:';

        $scope.requestUpdateRMEEscalation = function (escalationName) {
            $scope.submittingRequest = true;
            const message = 'Escalation update requested. You will receive an update from a manager shortly.';
            const comment = `${$scope.escalationMessage}\n ${message}`;
            const updateJson = {
                escalationName: escalationName,
                isPrivate: false,
                text: comment,
                isRequestForUpdate: true,
                isRequestForReOpen: false,
                isRequestForClosure: false
            };
            hydrajs.escalations.updateEscalations(escalationName, updateJson).then((updatedInfo) => {
                if (RHAUtils.isNotEmpty(updatedInfo)) {
                    $scope.submitEscalationComment(updatedInfo.escalationName, comment, message);
                }
            }, (error) => {
                $scope.showErrorMessage(error);
            });
        }

        $scope.requestReOpenRMEEscalation = function (escalationName) {
            $scope.submittingRequest = true;
            const message = 'Escalation reopened. A manager will review your request shortly.';
            const comment = `${$scope.escalationMessage}\n ${message}`;
            const updateJson = {
                escalationName: escalationName,
                isPrivate: false,
                text: comment,
                isRequestForUpdate: false,
                isRequestForReOpen: true,
                isRequestForClosure: false
            };
            hydrajs.escalations.updateEscalations(escalationName, updateJson).then((updatedInfo) => {
                if (RHAUtils.isNotEmpty(updatedInfo)) {
                    $scope.submitEscalationComment(updatedInfo.escalationName, comment, message);
                }
            }, (error) => {
                $scope.showErrorMessage(error);
            });
        }

        $scope.requestClosureRMEEscalation = function (escalationName) {
            $scope.submittingRequest = true;
            const message = 'Escalation closed.';
            const comment = `${$scope.escalationMessage}\n ${message}`;
            const updateJson = {
                escalationName: escalationName,
                isPrivate: false,
                text: comment,
                isRequestForUpdate: false,
                isRequestForReOpen: false,
                isRequestForClosure: true
            };
            hydrajs.escalations.updateEscalations(escalationName, updateJson).then((updatedInfo) => {
                if (RHAUtils.isNotEmpty(updatedInfo)) {
                    $scope.submitEscalationComment(updatedInfo.escalationName, comment, message);
                }
            }, (error) => {
                $scope.showErrorMessage(error);
            });
        }

        $scope.showErrorMessage = function (errorMessage) {
            $scope.submittingRequest = false;
            AlertService.clearAlerts();
            AlertService.addStrataErrorMessage(errorMessage);
        };

        $scope.submitEscalationComment = function (escalationNum, comment, alertMessage) {
            if (escalationNum !== undefined) {     
                CaseService.getCaseEscalation(CaseService.kase.account_number, CaseService.kase.case_number);
            }
            strataService.cases.comments.post(CaseService.kase.case_number, comment, true, false).then(function(){
                CaseService.checkForCaseStatusToggleOnAttachOrComment();
                if (escalationNum !== undefined) {
                    AlertService.clearAlerts();
                    AlertService.addSuccessMessage(gettextCatalog.getString(alertMessage));
                    $scope.submittingRequest = false;
                }
                CaseService.populateComments($stateParams.id).then(function (comments) {
                    $scope.showErrorMessage(error);
                }, function (error) {
                    $scope.showErrorMessage(error);
                });
            }, function (error) {
                $scope.showErrorMessage(error);
            });
        }
    }
}
