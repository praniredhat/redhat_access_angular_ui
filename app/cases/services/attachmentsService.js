'use strict';

import _ from 'lodash';
import hydrajs from '../../shared/hydrajs';

export default class AttachmentsService {
    constructor($q, $sce, $state, $window, $location, $rootScope, RHAUtils, strataService, TreeViewSelectorUtils, $http, securityService, AlertService, CaseService, gettextCatalog, AUTH_EVENTS) {
        'ngInject';

        this.originalAttachments = [];
        this.updatedAttachments = [];
        this.backendAttachments = [];
        this.suggestedArtifact = {};
        this.proceedWithoutAttachments = false;
        this.uploadingAttachments = false;
        this.loading = false;
        this.maxAttachmentSize;
        this.s3EnabledForAccount = false;

        this.init = async () => {
            this.s3EnabledForAccount = await this.isValidS3UploadAccount();
        };

        this.reEvaluateS3EnabledForAccount = async () => {
            this.s3EnabledForAccount = await this.isValidS3UploadAccount();
        }

        this.fetchS3Configs = async () => {
            try {
                this.s3AccountConfigurations = await hydrajs.kase.attachments.getS3UploadAccounts();
            } catch (error) {
                this.s3AccountConfigurations = {
                    s3UploadFunctionality: 'specified_accounts',
                    result: [],
                    partSize: 5 * 1024 * 1024,
                    queueSize: 5
                };
            }
        };

        this.accountCanAddAttachments = () => _.get(securityService, 'loginStatus.authedUser.can_add_attachments', false);

        this.isValidS3UploadAccount = async () => {
            if(RHAUtils.isEmpty(this.s3AccountConfigurations)) {
                await this.fetchS3Configs();
            }
            return this.checkAccountInS3Config();
        };

        this.checkAccountInS3Config = function () {
            const accountNumber = RHAUtils.isNotEmpty(CaseService.account.number) ? CaseService.account.number : securityService.loginStatus.authedUser.account.number;
            const uploadFunctionality = this.s3AccountConfigurations.s3UploadFunctionality;
            if (uploadFunctionality === 'enable_all' ||
                (uploadFunctionality === 'specified_accounts' &&
                    _.find(this.s3AccountConfigurations.result, (o) => o === accountNumber))) {
                return true;
            }
            return false;
        };

        // this.isAwsAttachment = (attachment, s3EnabledForAccount) => s3EnabledForAccount && attachment && attachment.link &&
        //     (attachment.link.indexOf('/hydra/rest/') > -1 || attachment.link.indexOf('/hydrafs/rest/') > -1);

        // always return false as we want hydra/strata to be used for download in PCM for now
        this.isAwsAttachment = (attachment, s3EnabledForAccount) => false;

        this.clear = function () {
            this.originalAttachments = [];
            this.updatedAttachments = [];
            this.backendAttachments = [];
            this.suggestedArtifact = {};
        };
        this.updateBackEndAttachments = function (selected) {
            this.backendAttachments = selected;
        };
        this.hasBackEndSelections = function () {
            return TreeViewSelectorUtils.hasSelections(this.backendAttachments);
        };
        this.removeUpdatedAttachment = function ($index) {
            this.updatedAttachments.forEach((value, index) => index > $index ? value.updatedAttachmentsIndex-- : null);
            this.updatedAttachments.splice($index, 1);
        };

        this.removeOriginalAttachment = function (attachment) {
            var progressMessage = AlertService.addWarningMessage(gettextCatalog.getString('Deleting attachment: {{attachmentName}}', {attachmentName: attachment.file_name}));

            strataService.cases.attachments.remove(attachment.uuid, CaseService.kase.case_number).then(angular.bind(this, function () {
                AlertService.removeAlert(progressMessage);
                AlertService.addSuccessMessage(gettextCatalog.getString('Successfully deleted attachment:{{attachmentName}}', {attachmentName: attachment.file_name}));
                var i = 0;
                for (i; i < this.originalAttachments.length; i++) {
                    if (this.originalAttachments[i].uuid === attachment.uuid) {
                        break;
                    }
                }
                this.originalAttachments.splice(i, 1);
            }), function (error) {
                AlertService.addStrataErrorMessage(error);
            });

        };
        this.addNewAttachment = function (attachment) {
            this.updatedAttachments.push(attachment);
        };
        this.defineOriginalAttachments = function (attachments) {
            if (!angular.isArray(attachments)) {
                this.originalAttachments = [];
            } else {
                this.originalAttachments = attachments;
            }
        };
        this.postBackEndAttachments = function (caseId) {
            var selectedFiles = TreeViewSelectorUtils.getSelectedLeaves(this.backendAttachments);
            return securityService.getBasicAuthToken().then(function (auth) {
                /*jshint unused:false */
                //we post each attachment separately
                var promises = [];
                angular.forEach(selectedFiles, function (file) {
                    var jsonData = {
                        authToken: auth,
                        attachment: file,
                        caseNum: caseId
                    };
                    var deferred = $q.defer();
                    $http.post('attachments', jsonData).success(function (data, status, headers, config) {
                        deferred.resolve(data);
                        AlertService.clearAlerts();
                        AlertService.addSuccessMessage(gettextCatalog.getString('Successfully uploaded attachment {{attachmentName}} to case {{caseNumber}}',{attachmentName:jsonData.attachment,caseNumber:caseId}));
                    }).error(function (data, status, headers, config) {
                        var errorMsg = '';
                        switch (status) {
                            case 401:
                                errorMsg = ' : Unauthorised.';
                                break;
                            case 409:
                                errorMsg = ' : Invalid username/password.';
                                break;
                            case 500:
                                errorMsg = ' : Internal server error';
                                break;
                        }
                        AlertService.addDangerMessage(gettextCatalog.getString('Failed to upload attachment {{attachmentName}} to case {{caseNumber}}: {{errorMessage}}',{attachmentName:jsonData.attachment,caseNumber:caseId,errorMessage:errorMsg}));
                        deferred.reject(data);
                    });
                    promises.push(deferred.promise);
                });
                return $q.all(promises);
            });
        };

        this.getAttachments = async function(caseId) {
            const response = await hydrajs.kase.attachments.getAttachmentsS3(caseId);
            const attachments = _.map(response, (item) => {
                const lastModifiedDate = RHAUtils.convertToTimezone(item.lastModifiedDate);
                item.file_name = item.fileName || item.filename;
                item.last_modified_date = RHAUtils.formatDate(lastModifiedDate, 'MMM DD YYYY');
                item.last_modified_time = RHAUtils.formatDate(lastModifiedDate, 'hh:mm A Z');
                item.sortModifiedDate = new Date(item.lastModifiedDate);
                item.published_date = RHAUtils.formatDate(lastModifiedDate, 'MMM DD YYYY');
                item.published_time = RHAUtils.formatDate(lastModifiedDate, 'hh:mm A Z');
                return item;
            });
            this.defineOriginalAttachments(attachments);
            this.loading = false;
        };

        this.updateAttachments = async function(caseId) {
            this.uploadingAttachments = true;
            const response = this.s3EnabledForAccount ? await this.updateAttachmentsS3(caseId) : await this.updateAttachmentsStrata(caseId);
            this.uploadingAttachments = false;
            return response;
        };

        this.updateAttachmentsStrata = function (caseId) {
            const hasServerAttachments = this.hasBackEndSelections();
            const hasLocalAttachments = this.updatedAttachments && this.updatedAttachments.length > 0;
            if (hasLocalAttachments || hasServerAttachments) {
                var promises = [];
                var updatedAttachments = this.updatedAttachments;
                if (hasServerAttachments) {
                    promises.push(this.postBackEndAttachments(caseId));
                }
                if (hasLocalAttachments) {
                    //find new attachments
                    _.each(updatedAttachments, (attachment, index) => {
                        if (!attachment.hasOwnProperty('uuid')) {
                            var formdata = new FormData();
                            formdata.append('file', attachment.fileObj);
                            formdata.append('description', attachment.description);
                            attachment.updatedAttachmentsIndex = index;

                            const updateProgress = (progress, abort) => {
                                attachment.progress = Math.round(progress);
                                attachment.verifyingUpload = attachment.progress === 100;

                                if (!attachment.abort) {
                                    attachment.abort = abort;
                                }

                                if ($rootScope.$$phase !== '$apply' && $rootScope.$$phase !== '$digest') {
                                    $rootScope.$apply();
                                }
                            };

                            var promise = strataService.cases.attachments.post(formdata, caseId, updateProgress);
                            promise.then(async (uri) => {
                                attachment.progress = null;
                                attachment.uri = uri;
                                attachment.uuid = uri.slice(uri.lastIndexOf('/') + 1);
                                var currentDate = new Date();
                                var lastModifiedDate = RHAUtils.convertToTimezone(currentDate);
                                attachment.sortModifiedDate = currentDate;
                                attachment.last_modified_date = RHAUtils.formatDate(lastModifiedDate, 'MMM DD YYYY');
                                attachment.last_modified_time = RHAUtils.formatDate(lastModifiedDate, 'hh:mm A Z');
                                attachment.published_date = RHAUtils.formatDate(lastModifiedDate, 'MMM DD YYYY');
                                attachment.published_time = RHAUtils.formatDate(lastModifiedDate, 'hh:mm A Z');
                                attachment.uploadComplete = true;
                                attachment.verifyingUpload = false;
                                AlertService.addSuccessMessage(gettextCatalog.getString('Successfully uploaded attachment {{attachmentFileName}} to case {{caseNumber}}', {
                                    attachmentFileName: attachment.file_name,
                                    caseNumber: caseId
                                }));
                                this.removeUpdatedAttachment(attachment.updatedAttachmentsIndex);

                                if (this.updatedAttachments.length === 0) {
                                    this.uploadingAttachments = false;
                                }
                            }).catch(async (error) => {
                                if (error && error.message && error.message === 'aborted') {
                                    AlertService.addSuccessMessage(gettextCatalog.getString('Successfully aborted {{filename}} upload', {
                                        filename: attachment.fileObj.name
                                    }));
                                } else if (navigator.appVersion.indexOf("MSIE 10") !== -1) {
                                    if ($location.path() === '/case/new') {
                                        $state.go('edit', {id: caseId});
                                        AlertService.clearAlerts();
                                        CaseService.submittingCase = false;
                                    } else {
                                        $window.location.reload();
                                    }
                                    this.removeUpdatedAttachment(attachment.updatedAttachmentsIndex);
                                } else {
                                    AlertService.addStrataErrorMessage(error);
                                    this.removeUpdatedAttachment(attachment.updatedAttachmentsIndex);
                                }

                                if (this.updatedAttachments.length === 0) {
                                    this.uploadingAttachments = false;
                                }
                            });
                            promises.push(promise);
                        }
                    });
                }
                var uploadingAlert = AlertService.addWarningMessage(gettextCatalog.getString('Uploading attachments...'));
                var parentPromise = $q.all(promises);
                parentPromise.then(angular.bind(this, function () {
                    this.updatedAttachments = [];
                    AlertService.removeAlert(uploadingAlert);
                }), function () {
                    AlertService.removeAlert(uploadingAlert);
                });
                return parentPromise;
            }
        };

        this.abortUpload = function (attachment) {
            attachment.aborted = true;
            attachment.abort();
        };

        this.refreshTokenIfNeeded = async (timeRemaining = 60) => {
            const isTokenExpired = _.get(window,'sessionjs._state.keycloak.isTokenExpired');
            if(isTokenExpired && isTokenExpired(timeRemaining)) {
                try{
                    await window.sessionjs.updateToken(true);
                } catch(e) {
                    console.log('failed to update token');
                }
            }
        }

        this.updateAttachmentsS3 = async function (caseId) {
            const hasServerAttachments = this.hasBackEndSelections();
            const hasLocalAttachments = this.updatedAttachments && this.updatedAttachments.length > 0;
            const uploadAlert = AlertService.addWarningMessage(gettextCatalog.getString('Uploading attachments...'));

            if (hasLocalAttachments || hasServerAttachments) {
                var promises = [];
                var updatedAttachments = this.updatedAttachments;
                if (hasServerAttachments) {
                    promises.push(this.postBackEndAttachments(caseId));
                }
                if (hasLocalAttachments) {
                    //find new attachments
                    try {
                        await Promise.all(_.map(updatedAttachments, async (attachment, index) => {
                            if (!attachment.hasOwnProperty('uuid')) {
                                attachment.updatedAttachmentsIndex = index;
                                const putObjectRequest = {
                                    Body: attachment.fileObj,
                                    ContentLength: attachment.fileObj.size,
                                    Metadata: {}
                                };

                                attachment.description &&
                                    (putObjectRequest.Metadata["x-amz-meta-description"] = attachment.description)

                                attachment.fileObj.name && 
                                    (putObjectRequest.Metadata["x-amz-meta-fileName"] = attachment.fileObj.name)

                                attachment.fileObj.size &&
                                    (putObjectRequest.Metadata["x-amz-meta-byteLength"] = attachment.fileObj.size.toString())

                                attachment.fileObj.type && 
                                    (putObjectRequest.Metadata["x-amz-meta-content-type"] = attachment.fileObj.type)

                                const s3UploadCredentialsData = {
                                    fileName: attachment.fileObj.name,
                                    size: attachment.fileObj.size,
                                    isPrivate: !CaseService.isCommentPublic,
                                    description: attachment.description
                                };

                                const listener = (progress, abort) => {
                                    const decimal = progress.loaded / progress.total;
                                    const percent = decimal * 100;
                                    attachment.progress = Math.floor(percent);
                                    attachment.verifyingUpload = decimal === 1;
                                    if (!attachment.abort) {
                                        attachment.abort = abort;
                                    }
                                    if ($rootScope.$$phase !== '$apply' && $rootScope.$$phase !== '$digest') {
                                        $rootScope.$apply();
                                    }
                                };
                                // While upload is in progress, Keep trying to refreshing Auth token after every 50 seconds if its ie11 and token is about to expire within 60 seconds.
                                // const isIE11 = !((!(window.ActiveXObject) && 'ActiveXObject' in window));
                                const refreshTokenInterval = setInterval(()=>{this.refreshTokenIfNeeded()}, 50*1000);
                                try {
                                    await hydrajs.kase.attachments.uploadAttachmentS3(
                                        caseId,
                                        s3UploadCredentialsData,
                                        putObjectRequest,
                                        listener,
                                        true,
                                        {partSize: this.s3AccountConfigurations.partSize, queueSize: this.s3AccountConfigurations.queueSize}
                                    );

                                    attachment.uploadComplete = true;
                                    attachment.verifyingUpload = false;
                                    AlertService.addSuccessMessage(gettextCatalog.getString('Successfully uploaded attachment {{filename}} to case {{id}}', {
                                        filename: attachment.fileObj.name,
                                        id: caseId
                                    }));
                                    this.removeUpdatedAttachment(attachment.updatedAttachmentsIndex);

                                    if (this.updatedAttachments.length === 0) {
                                        this.uploadingAttachments = false;
                                    }
                                } catch (error) {
                                    if (navigator.appVersion.indexOf("MSIE 10") !== -1) {
                                        if ($location.path() === '/case/new') {
                                            $state.go('edit', {id: caseId});
                                            AlertService.clearAlerts();
                                            CaseService.submittingCase = false;
                                        } else {
                                            $window.location.reload();
                                        }
                                        this.removeUpdatedAttachment(attachment.updatedAttachmentsIndex);
                                    } else if (error.message === 'Request aborted by user') {
                                        AlertService.addSuccessMessage(gettextCatalog.getString('Successfully aborted {{filename}} upload', {
                                            filename: attachment.fileObj.name
                                        }));
                                    } else {
                                        this.removeUpdatedAttachment(attachment.updatedAttachmentsIndex);
                                        AlertService.addDangerMessage(gettextCatalog.getString('Could not upload {{filename}}: {{error}}', {
                                            filename: attachment.fileObj.name,
                                            error: error.message
                                        }));
                                    }

                                    if (this.updatedAttachments.length === 0) {
                                        this.uploadingAttachments = false;
                                    }
                                } finally {
                                    refreshTokenInterval && clearInterval(refreshTokenInterval);
                                }
                            }
                        }));

                        this.updatedAttachments = [];
                        AlertService.removeAlert(uploadAlert);
                    } catch (error) {
                        AlertService.removeAlert(uploadAlert);
                    }
                }
            }
        };

        this.parseArtifactHtml = function () {
            var parsedHtml = '';
            if (RHAUtils.isNotEmpty(this.suggestedArtifact.description)) {
                var rawHtml = this.suggestedArtifact.description.toString();
                parsedHtml = $sce.trustAsHtml(rawHtml);
            }
            return parsedHtml;
        };
        this.fetchMaxAttachmentSize = function () {
            strataService.values.cases.attachment.size().then(angular.bind(this, function (response) {
                if (RHAUtils.isNotEmpty(response)) {
                    this.maxAttachmentSize = response.match(/\d+/)[0];
                }
            }), function (error) {
                AlertService.addStrataErrorMessage(error);
            });
        };

        if (securityService.loginStatus.isLoggedIn) {
            this.init();
        }

        $rootScope.$on(AUTH_EVENTS.loginSuccess, angular.bind(this, function () {
            this.init();
        }));
    }
}
