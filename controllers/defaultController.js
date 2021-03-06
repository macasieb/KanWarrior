var taskManager = require("../lib/taskManager");
var Task = require("../models/Task");
var callDAVWrap = require("../lib/calDAVWrap");
var bodyParser = require('body-parser');
var helper = require("../lib/helper");
var urlencodedParser = bodyParser.urlencoded({extended: true});

module.exports.controller = function (app) {
    app.use(bodyParser.urlencoded({extended: true}));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    app.get('/', function (req, res) {

        var projects = [];
        var tasks = [];
        var tags = [];
        var lastTags;
        var infoString = app.locals.infoString;
        var submitted = false;

        if (app.locals.first == 1) {    // manage display of CalDAV info panel
            app.locals.infoString = null;
            app.locals.first = 0;
        }

        if (req.query.projects == null) // Set values for constant project filtering
        {
            if (app.locals.lastProjectVal != null)
                projects.lastVal = app.locals.lastProjectVal;
            else
                projects.lastVal = "All";
            req.query.projects = projects.lastVal;
        } else {
            submitted = true;
            projects.lastVal = req.query.projects;
        }

        if (submitted) {                     // Set values for constant tags filtering
            if (req.query.tags == null)
                lastTags = null;
            else
                lastTags = req.query.tags;
        } else {
            if (app.locals.lastTagsVal != null && app.locals.lastTagsVal != '') {
                lastTags = app.locals.lastTagsVal;
            }
            else
                lastTags = null;
            if (typeof lastTags === 'string')
                req.query.tags = lastTags.split(',');
            else
                req.query.tags = lastTags;
            lastTags = req.query.tags;
        }

        taskManager.getAllTasks((taskArray)=> {
            taskManager.update(taskArray);

            for (var i = 0; i < taskArray.length; i++) {
                if ((req.query.projects == taskArray[i].project) || (req.query.projects == "All")) { //filter tasks by projects
                    if (helper.compareTags(taskArray[i].tags, req.query.tags)) {
                        pushTask(taskArray[i], i, tasks);
                    }
                }
                else if (req.query.projects == "-") { //filter tasks with no projects
                    if ((taskArray[i].project == "") || (taskArray[i].project == null) || (taskArray[i].project == undefined)) {
                        if (helper.compareTags(taskArray[i].tags, req.query.tags)) {
                            pushTask(taskArray[i], i, tasks);
                        }
                    }
                }

                if ((projects.indexOf(taskArray[i].project) <= -1) && !(taskArray[i].project == null )) // make projects array
                {
                    projects.push(taskArray[i].project);
                }

                tags = tags.concat(taskArray[i].tags); //join all arrays of tags into one
                tags = tags.reduce(function (a, b) {      //leave out duplicate tags
                    if ((a.indexOf(b) < 0) && (!helper.isBoardTag(b))) a.push(b);
                    return a;
                }, []);
            }

            if (lastTags == null)
                lastTags = '';
            projects.push("All"); //Create ability to list tasks from all projects
            projects.push("-"); //Create ability to list all tasks with no projects

            helper.sortTasks(tasks);
            res.render('index.ejs', {
                tasks: tasks,
                projects: projects,
                tags: tags,
                lastTags: lastTags,
                CalDAVinfo: infoString
            });
        });
    });

    app.post('/new_task', urlencodedParser, function (req, res) {
        taskManager.addTask(req.body.description, req.body.due, req.body.priority, req.body.project, req.body.tags);
        res.redirect('/');
    });

    app.post('/delete_task', urlencodedParser, function (req, res) {
        taskManager.deleteTask(req.body.uuid);
        res.redirect('/');
    });

    app.post('/edit_task', urlencodedParser, function (req, res) {
        taskManager.editTask(req.body.id, req.body.description, req.body.due, req.body.priority, req.body.project, req.body.tags, req.body.status, req.body.start);
        app.locals.lastProjectVal = req.body.lastProjectVal;
        app.locals.lastTagsVal = req.body.lastTagsVal;
        res.redirect('/');
    });

    app.post('/set_credentials', function (req, res) {
        app.locals.userName = req.body.userName;
        app.locals.password = req.body.password;
        app.locals.url = req.body.url;
        res.redirect('/');
    });

    app.post('/sync', urlencodedParser, function (req, res) {

        var authorization = [];
        authorization.user = app.locals.userName;
        authorization.pass = app.locals.password;
        authorization.uri = app.locals.url;
        if (authorization.user == null || authorization.pass == null || authorization.uri == null) {
            console.log("Wrong credentials")
            res.redirect('/');
        }
        callDAVWrap.setCredentials(authorization, function (projectName) {
            taskManager.getAllProjectTasks(projectName, function (taskArray) {
                var uuids1 = [];
                var descriptions1 = [];

                for (var i = 0; i < taskArray.length; i++) { // gather information about existing tasks in project
                    uuids1.push(taskArray[i].uuid);
                    descriptions1.push(taskArray[i].description);
                }

                callDAVWrap.getTasks(function (list) {
                    var counter1 = 0;
                    var counter2 = 0;
                    var uuids2 = [];
                    var descriptions2 = [];
                    var indexes2 = [];

                    for (var i = 0; i < list.length; i++) { // add tasks to TaskWarrior if they are not there already
                        uuids2.push(list[i].uuid);
                        descriptions2.push(list[i].title);
                        indexes2.push(i);

                        if (uuids1.indexOf(list[i].uuid) == -1 && descriptions1.indexOf(list[i].title) == -1 && list[i].status != 'completed') {
                            counter1++;
                            taskManager.addTask(list[i].title, list[i].due, list[i].priority, list[i].project, '', list[i].entry);
                        }
                        else if (list[i].status == 'completed') {
                            var ind = descriptions1.indexOf(list[i].title);
                            if (ind != -1 && taskArray[ind].status != 'completed') {
                                taskArray[ind].tags = 'done';
                                taskArray[ind].status = 'completed';
                                taskManager.editTask(taskArray[ind].id, taskArray[ind].description, '', '', taskArray[ind].project, taskArray[ind].tags, '', '');
                            }
                        }
                    }

                    for (i = 0; i < taskArray.length; i++) { // send tasks to server if they are not already there
                        if (uuids2.indexOf(taskArray[i].uuid) == -1) {

                            counter2++;
                            callDAVWrap.sendTask(taskArray[i]);
                        }
                        else if (uuids2.indexOf(taskArray[i].uuid) != -1) { // update server to local changes

                            var ind = uuids2.indexOf(taskArray[i].uuid);
                            if (list[ind].title != taskArray[i].description || list[ind].due != taskArray[i].due || list[ind].status != taskArray[i].status || list[ind].priority != taskArray[i].priority) {
                                taskArray[i].eTag = list[ind].eTag;
                                callDAVWrap.editTask(taskArray[i]);
                            }
                        }
                    }

                    app.locals.infoString = counter1 + ' task(s) were added and ' + counter2 + ' were sent to project: ' + projectName + '.';
                    app.locals.first = 1; // crappy workaround for message state

                    res.redirect('/');
                });
            });
        });
    });

    function pushTask(task, i, tasks) {
        task = helper.attachToBoard(task, taskManager);
        tasks.push(
            {
                uuid: task.uuid,
                id: i + 1,
                desc: task.description,
                status: task.status,
                entry: task.entry,
                project: task.project,
                due: task.due,
                urgency: task.urgency,
                priority: task.priority,
                tags: task.tags,
                start: task.start,
                parent: task.parent,
                type: 'task'
            }
        )
    }
};
