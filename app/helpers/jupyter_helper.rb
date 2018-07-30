module JupyterHelper

  # Given a name of a test - search the SEEK config setting for the relevant test spec (ipynb file name, display cells, etc)
  def get_notebook_spec_for_test(test)
    notebook_spec = Settings.defaults[:python_nb_notebooks].detect {|nb| nb["id"] == test }
    if notebook_spec.nil?
      Rails.logger.error "ERROR: test " + test + " not implemented."
      return
    end
    return notebook_spec
  end

  # Generate a temporary filename, return a KEY from the filename itself
  # Relies on the filename being foo-bla-KEY.suffix   (number of dashes doesn't matter as long as KEY is the last)
  def gen_temp_filename(n)
    arr = n.split(".")                        #seperate filename to prefix and suffix
    key = arr[0].split("-")[-1]               #get a key into the dictionaries (last word from the file name)

    # https://stackoverflow.com/questions/13787746/creating-a-thread-safe-temporary-file-name
    fname = Dir::Tmpname.make_tmpname([arr[0], "."+arr[1]], nil)
    return key, fname
  end

  # Given a list of file names, generates a temporary filename for each and returns a dictionary of filenames and dictionary of paths
  def create_temp_files(file_list, prefix_path)
    fnames = {}
    paths = {}
    for n in file_list
      key, name = gen_temp_filename(n)
      fnames[key] = name
      paths[key] =  prefix_path + "/" + name
    end
    return fnames, paths
  end

  # write a json object into a json file
  def write_from_json(file_to_write, json_obj)
    session.delete :extraction_exception_message
    begin
      outfile = File.new(file_to_write,"w")
      outfile.write(JSON.generate(json_obj))
      outfile.close()
    rescue Exception => e
      ExceptionNotifier.notify_exception(e, data: {
          message: "Error Jupyter notebooks: Error writing file from a JSON object:  #{file_to_write}",
          current_logged_in_user: current_user
      })
      session[:extraction_exception_message] = e.message
    end
  end

  def replace_placeholder_in_notebook_cell(json_notebook, cell, substitutions)
    json_notebook["cells"][cell]["source"].each_with_index do |line, i|
      substitutions.each do |key, value|
        line[key.to_s] = value
      end
      Rails.logger.info "Cell after Replace: " + json_notebook["cells"][cell]["source"][i].to_s
    end
    return json_notebook
  end

  def run_nbconvert_command(input, params, output=nil)
    # location of the nbconvert command to be run
    nbconvert = Settings.defaults[:nbconvert_path]

    to_run = "#{nbconvert} #{input} #{params}"
    unless output.nil?
      to_run += " --output=#{output}"
    end

    Rails.logger.info "Running nbconvert command: #{to_run}"
    result = `#{to_run}`
    Rails.logger.info result
  end

  def select_cell_from_notebook(cell_list, in_book_file_path, out_book_file_path, without_source)
    Rails.logger.info "Selecting cells from notebook: " + cell_list.to_s

    notebook_source = File.read(in_book_file_path)
    json_notebook = JSON.parse(notebook_source)
    o = []

    cell_list.each do |i|
      #Rails.logger.info i
      #Rails.logger.info json_notebook["cells"][i]['source']
      if(without_source>0 and json_notebook["cells"][i]["cell_type"] != "markdown")
        json_notebook["cells"][i]['source']=[]
        json_notebook["cells"][i].delete :source
      end
      o = o.push json_notebook["cells"][i]
    end

    json_notebook["cells"]=o

    # write the modified book
    outfile = File.new(out_book_file_path,"w")
    outfile.write(JSON.generate(json_notebook))
    outfile.close()
  end

end