#!/bin/sh -e
#
### BEGIN INIT INFO
# Provides:          seek-delayed-job
# Required-Start:    $syslog
# Required-Stop:     $syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Seek delayed job daemon
# Description:       Start seek delayed job
### END INIT INFO

# Symlink target for initscripts that have been converted to Upstart.
 
set -e
APP_PATH="{{ seek_project_root }}"
 
start_job() {
        echo "Starting delayed job"
        sudo -Hu {{ www_user }} bash -lc "cd ${APP_PATH} && RAILS_ENV={{ rails_env }} rake seek:workers:start"
}
 
stop_job() {
        echo "Stopping delayed job"
        sudo -Hu {{ www_user }} bash -lc "cd ${APP_PATH} && RAILS_ENV={{ rails_env }} rake seek:workers:stop"
}
restart_job() {
        echo "Restarting delayed job"
        sudo -Hu {{ www_user }} bash -lc "cd ${APP_PATH} && RAILS_ENV={{ rails_env }} rake seek:workers:restart"
}
job_status() {
        echo "delayed job status ..."
        sudo -Hu {{ www_user }} bash -lc "cd ${APP_PATH} && RAILS_ENV={{ rails_env }} rake seek:workers:status"
}
 
COMMAND="$1"
shift
 
case $COMMAND in
status)
    job_status 
    ;;
start|stop|restart)
    $ECHO
    if [ "$COMMAND" = "stop" ]; then
        stop_job
    elif [ "$COMMAND" = "start" ]; then
        start_job
    elif  [ "$COMMAND" = "restart" ]; then
        restart_job
        exit 0
    fi
    ;;
esac
